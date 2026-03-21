import pulumi
import pulumi_aws as aws

class IngestionWorker(pulumi.ComponentResource):
    def __init__(self, name: str, env: str, base_infra, opts: pulumi.ResourceOptions = None):
        super().__init__("minerva:ingestion:IngestionWorker", name, {}, opts)

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
            container_definitions=pulumi.Output.format('''[
                {{
                    "name": "ingestion",
                    "image": "{0}",
                    "essential": true,
                    "environment": [
                        {{"name": "S3_BUCKET", "value": "{1}"}},
                        {{"name": "DATABASE_URL", "value": "{2}"}}
                    ],
                    "logConfiguration": {{
                        "logDriver": "awslogs",
                        "options": {{
                            "awslogs-group": "{3}",
                            "awslogs-region": "{4}",
                            "awslogs-stream-prefix": "ecs"
                        }}
                    }}
                }}
            ]''', self.repo.repository_url, base_infra.bucket.id, base_infra.db_url, self.log_group.name, aws.get_region().region),
            opts=pulumi.ResourceOptions(parent=self)
        )
        self.repo_url = self.repo.repository_url
        self.task_def_arn = self.task_def.arn

        self.register_outputs({
            "repo_url": self.repo_url,
            "task_def_arn": self.task_def_arn
        })
