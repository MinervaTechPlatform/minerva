import pulumi
from components.base import BaseInfra
from components.core import CoreService
from components.ingestion import IngestionWorker
from components.dashboard import DashboardApp

# 1. Config management
config = pulumi.Config()
env = config.get("environment") or "dev"
deploy_core = config.get_bool("deploy_core") if config.get("deploy_core") is not None else True
deploy_ingestion = config.get_bool("deploy_ingestion") if config.get("deploy_ingestion") is not None else True
deploy_dashboard = config.get_bool("deploy_dashboard") if config.get("deploy_dashboard") is not None else True

prefix = f"minerva-{env}"

# 2. Base layer (VPC, Cluster, RDS, S3)
base = BaseInfra(prefix, env)

if deploy_ingestion:
    ingestion = IngestionWorker(f"{prefix}-ingestion", env, base)
    pulumi.export("ingestion_task_arn", ingestion.task_def_arn)
    pulumi.export("ingestion_repo_url", ingestion.repo.repository_url)
    pulumi.export("ecs_cluster_name", base.cluster.name)
    pulumi.export("vpc_id", base.vpc.vpc_id)
    pulumi.export("private_subnet_ids", base.vpc.private_subnet_ids)

# 3. Modular services
if deploy_core:
    # Ensure ingestion is created first if we need its task ARN
    ingest_arn = ingestion.task_def_arn if deploy_ingestion else ""
    core = CoreService(f"{prefix}-core", env, base, ingest_arn)
    pulumi.export("core_url", core.service_url)
    pulumi.export("core_repo_url", core.repo.repository_url)

if deploy_dashboard:
    ingestion_ref = ingestion if deploy_ingestion else None
    core_url = core.service_url if deploy_core else pulumi.Output.from_input("")
    dashboard = DashboardApp(f"{prefix}-dashboard", env, base, ingestion_worker=ingestion_ref, core_url=core_url)
    pulumi.export("dashboard_url", dashboard.service_url)
    pulumi.export("dashboard_repo_url", dashboard.repo.repository_url)

# Final exports
pulumi.export("db_endpoint", base.db.address)
pulumi.export("s3_bucket", base.bucket.id)
