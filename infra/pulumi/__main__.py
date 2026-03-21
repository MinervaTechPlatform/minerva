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

# 3. Modular services
if deploy_core:
    core = CoreService(f"{prefix}-core", env, base)
    pulumi.export("core_url", core.service_url)
    pulumi.export("core_repo_url", core.repo.repository_url)

if deploy_ingestion:
    ingestion = IngestionWorker(f"{prefix}-ingestion", env, base)
    pulumi.export("ingestion_task_arn", ingestion.task_def_arn)
    pulumi.export("ingestion_repo_url", ingestion.repo.repository_url)

if deploy_dashboard:
    dashboard = DashboardApp(f"{prefix}-dashboard", env, base)
    pulumi.export("dashboard_app_id", dashboard.app_id)
    pulumi.export("dashboard_default_domain", dashboard.default_domain)
    pulumi.export("dashboard_develop_url", dashboard.develop_url)
    pulumi.export("dashboard_gowtham_url", dashboard.gowtham_url)

# Final exports
pulumi.export("db_endpoint", base.db.address)
pulumi.export("s3_bucket", base.bucket.id)
