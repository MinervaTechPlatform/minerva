import pulumi
import pulumi_aws as aws

class IngestionWorker(pulumi.ComponentResource):
    def __init__(self, name: str, env: str, base_infra, opts: pulumi.ResourceOptions = None):
        super().__init__("minerva:ingestion:IngestionWorker", name, {}, opts)

        aws_config = pulumi.Config("aws")
        region = aws_config.get("region") or "us-east-1"

        self.tags = {
            "env": env,
            "component": "ingestion"
        }

        # 1. ECR Repository for Ingestion
        self.repo = aws.ecr.Repository(
            f"{name}-repo",
            force_delete=True,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 2. Ingestion Task Role (Permissions for S3 and DB)
        self.task_role = aws.iam.Role(
            f"{name}-task-role",
            assume_role_policy='''{
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
            }''',
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )
        aws.iam.RolePolicyAttachment(
            f"{name}-s3-policy",
            role=self.task_role.name,
            policy_arn="arn:aws:iam::aws:policy/AmazonS3FullAccess",
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 3. Log Group
        self.log_group = aws.cloudwatch.LogGroup(
            f"/ecs/{name}-log-group",
            retention_in_days=7,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 4. Ingestion Task Definition (1 vCPU, 1 GB RAM, as requested)
        self.task_def = aws.ecs.TaskDefinition(
            f"{name}-task",
            family=f"{name}",
            requires_compatibilities=["FARGATE"],
            network_mode="awsvpc",
            cpu="512",     # 1 vCPU
            memory="1024",  # 1 GB RAM
            execution_role_arn=base_infra.ecs_execution_role.arn,
            task_role_arn=self.task_role.arn,
            tags=self.tags,
            container_definitions=pulumi.Output.all(
                repo_url=self.repo.repository_url,
                bucket_name=base_infra.bucket.id,
                db_host=base_infra.db.address,
                db_password=base_infra.db_password.result,
                log_group=self.log_group.name,
                account_id=aws.get_caller_identity().account_id,
                sarvam_api_key=pulumi.Config().get_secret("sarvam_api_key") or ""
            ).apply(lambda args: f'''[
                {{
                    "name": "ingestion",
                    "image": "{args["repo_url"]}:latest",
                    "essential": true,
                    "environment": [
                        {{"name": "S3_BUCKET", "value": "{args["bucket_name"]}"}},
                        {{"name": "AWS_REGION", "value": "{region}"}},
                        {{"name": "STORAGE_TYPE", "value": "s3"}},
                        {{"name": "ENV", "value": "{env}"}},
                        {{"name": "DB_HOST", "value": "{args["db_host"]}"}},
                        {{"name": "DB_PORT", "value": "5432"}},
                        {{"name": "DB_NAME", "value": "minerva"}},
                        {{"name": "DB_USER", "value": "postgres"}},
                        {{"name": "DB_PASSWORD", "value": "{args["db_password"]}"}},
                        {{"name": "SARVAM_API_KEY", "value": "{args["sarvam_api_key"]}"}}
                    ],
                    "logConfiguration": {{
                        "logDriver": "awslogs",
                        "options": {{
                            "awslogs-group": "{args["log_group"]}",
                            "awslogs-region": "{region}",
                            "awslogs-stream-prefix": "ecs"
                        }}
                    }}
                }}
            ]'''),
            opts=pulumi.ResourceOptions(parent=self)
        )
        self.repo_url = self.repo.repository_url
        self.task_def_arn = self.task_def.arn

        # Security group for ingestion ECS tasks (allow all egress, no inbound needed)
        self.ingestion_sg = aws.ec2.SecurityGroup(
            f"{name}-sg",
            vpc_id=base_infra.vpc.vpc_id,
            description="Ingestion ECS task security group",
            ingress=[],
            egress=[{
                "protocol": "-1",
                "from_port": 0,
                "to_port": 0,
                "cidr_blocks": ["0.0.0.0/0"],
            }],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )
        aws.ec2.SecurityGroupRule(
            f"{name}-db-access",
            type="ingress",
            protocol="tcp",
            from_port=5432,
            to_port=5432,
            security_group_id=base_infra.db_sg.id,
            source_security_group_id=self.ingestion_sg.id,
            description="Allow ingestion ECS tasks to connect to Postgres",
            opts=pulumi.ResourceOptions(parent=self)
        )
        self.ingestion_sg_id = self.ingestion_sg.id

        self.register_outputs({
            "repo_url": self.repo_url,
            "task_def_arn": self.task_def_arn,
            "ingestion_sg_id": self.ingestion_sg_id,
        })
