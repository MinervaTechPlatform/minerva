import json
import pulumi
import pulumi_aws as aws


class DashboardApp(pulumi.ComponentResource):
    def __init__(self, name: str, env: str, base_infra, ingestion_worker=None, opts: pulumi.ResourceOptions = None):
        super().__init__("minerva:dashboard:DashboardApp", name, {}, opts)

        config = pulumi.Config()
        aws_config = pulumi.Config("aws")
        region = aws_config.get("region") or "us-east-1"

        auth_secret = config.require_secret("auth_secret")
        auth_google_id = config.require_secret("auth_google_id")
        auth_google_secret = config.require_secret("auth_google_secret")

        self.tags = {
            "env": env,
            "component": "dashboard"
        }

        # ── 1. ECR Repository ────────────────────────────────────────────────
        self.repo = aws.ecr.Repository(
            f"{name}-repo",
            force_delete=True,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )
        self.repo_lifecycle_policy = aws.ecr.LifecyclePolicy(
            f"{name}-repo-lifecycle-policy",
            repository=self.repo.name,
            policy=json.dumps({
                "rules": [
                    {
                        "rulePriority": 1,
                        "description": "Keep only the 10 most recent images",
                        "selection": {
                            "tagStatus": "any",
                            "countType": "imageCountMoreThan",
                            "countNumber": 10
                        },
                        "action": {
                            "type": "expire"
                        }
                    }
                ]
            }),
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 2. CloudWatch Log Group ──────────────────────────────────────────
        self.log_group = aws.cloudwatch.LogGroup(
            f"/ecs/{name}-log-group",
            retention_in_days=3,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 3. Dedicated IAM User for S3 Access (document uploads) ───────────
        self.s3_user = aws.iam.User(
            f"{name}-s3-user",
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.s3_user_policy = aws.iam.UserPolicy(
            f"{name}-s3-user-policy",
            user=self.s3_user.name,
            policy=pulumi.Output.all(
                bucket_arn=base_infra.bucket.arn
            ).apply(lambda args: json.dumps({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
                        "Resource": f"{args['bucket_arn']}/*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": "s3:ListBucket",
                        "Resource": args["bucket_arn"]
                    }
                ]
            })),
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.s3_access_key = aws.iam.AccessKey(
            f"{name}-s3-access-key",
            user=self.s3_user.name,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 4b. Dashboard Task Role (so ECS task can call ecs:RunTask) ────────
        self.task_role = aws.iam.Role(
            f"{name}-task-role",
            assume_role_policy=json.dumps({
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
            }),
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )
        aws.iam.RolePolicy(
            f"{name}-ecs-run-task-policy",
            role=self.task_role.name,
            policy=json.dumps({
                "Version": "2012-10-17",
                "Statement": [
                    {
                        "Effect": "Allow",
                        "Action": ["ecs:RunTask"],
                        "Resource": "*"
                    },
                    {
                        "Effect": "Allow",
                        "Action": "iam:PassRole",
                        "Resource": "*"
                    }
                ]
            }),
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 4. Security Groups ───────────────────────────────────────────────
        # ALB: allow HTTP from internet
        self.alb_sg = aws.ec2.SecurityGroup(
            f"{name}-alb-sg",
            vpc_id=base_infra.vpc.vpc_id,
            description="Allow HTTP inbound to dashboard ALB",
            ingress=[{
                "protocol": "tcp",
                "from_port": 80,
                "to_port": 80,
                "cidr_blocks": ["0.0.0.0/0"],
            }],
            egress=[{
                "protocol": "-1",
                "from_port": 0,
                "to_port": 0,
                "cidr_blocks": ["0.0.0.0/0"],
            }],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ECS tasks: allow traffic from ALB only
        self.ecs_sg = aws.ec2.SecurityGroup(
            f"{name}-ecs-sg",
            vpc_id=base_infra.vpc.vpc_id,
            description="Allow inbound from ALB to dashboard ECS tasks",
            ingress=[{
                "protocol": "tcp",
                "from_port": 3000,
                "to_port": 3000,
                "security_groups": [self.alb_sg.id],
            }],
            egress=[{
                "protocol": "-1",
                "from_port": 0,
                "to_port": 0,
                "cidr_blocks": ["0.0.0.0/0"],
            }],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 5. Application Load Balancer ─────────────────────────────────────
        # ALB and TG names have a 32-char AWS limit.
        # Using short explicit names (mnrv-{env}-dash-*) so Pulumi's random suffix
        # is not appended and we stay well within the limit.
        # e.g. "mnrv-dev-dash-alb" = 18 chars ✓
        short_prefix = f"mnrv-{env}-dash"

        self.alb = aws.lb.LoadBalancer(
            f"{name}-alb",
            name=f"{short_prefix}-alb",
            security_groups=[self.alb_sg.id],
            subnets=base_infra.vpc.public_subnet_ids,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.target_group = aws.lb.TargetGroup(
            f"{name}-tg",
            name=f"{short_prefix}-tg",
            port=3000,
            protocol="HTTP",
            vpc_id=base_infra.vpc.vpc_id,
            target_type="ip",
            health_check={
                "path": "/api/health",
                "healthy_threshold": 2,
                "unhealthy_threshold": 5,
                "timeout": 5,
                "interval": 30,
            },
            deregistration_delay=30,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.listener = aws.lb.Listener(
            f"{name}-listener",
            load_balancer_arn=self.alb.arn,
            port=80,
            default_actions=[{
                "type": "forward",
                "target_group_arn": self.target_group.arn,
            }],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        auth_url = pulumi.Output.format("http://{0}", self.alb.dns_name)

        # ── 6. ECS Task Definition ───────────────────────────────────────────
        # All env vars injected at task level (no build-time secrets needed)
        # Build ECS env vars — include ingestion details if worker was provided
        ingestion_task_arn = ingestion_worker.task_def_arn if ingestion_worker else pulumi.Output.from_input("")
        ingestion_sg_id = ingestion_worker.ingestion_sg_id if (ingestion_worker and hasattr(ingestion_worker, 'ingestion_sg_id')) else pulumi.Output.from_input("")

        container_env = pulumi.Output.all(
            db_url=base_infra.db_url,
            auth_url=auth_url,
            bucket_name=base_infra.bucket.id,
            auth_secret=auth_secret,
            auth_google_id=auth_google_id,
            auth_google_secret=auth_google_secret,
            s3_key_id=self.s3_access_key.id,
            s3_secret=self.s3_access_key.secret,
            cluster_name=base_infra.cluster.name,
            ingestion_task_arn=ingestion_task_arn,
            private_subnet_ids=base_infra.vpc.private_subnet_ids,
            ingestion_sg_id=ingestion_sg_id,
        ).apply(lambda args: json.dumps([
            {"name": "NODE_ENV",                "value": "production"},
            {"name": "DATABASE_URL",             "value": args["db_url"]},
            {"name": "AUTH_URL",                "value": args["auth_url"]},
            {"name": "AUTH_SECRET",              "value": args["auth_secret"]},
            {"name": "AUTH_TRUST_HOST",         "value": "true"},
            {"name": "AUTH_GOOGLE_ID",           "value": args["auth_google_id"]},
            {"name": "AUTH_GOOGLE_SECRET",       "value": args["auth_google_secret"]},
            {"name": "S3_ENDPOINT",              "value": f"https://s3.{region}.amazonaws.com"},
            {"name": "S3_REGION",                "value": region},
            {"name": "S3_BUCKET",                "value": args["bucket_name"]},
            {"name": "S3_ACCESS_KEY_ID",         "value": args["s3_key_id"]},
            {"name": "S3_SECRET_ACCESS_KEY",     "value": args["s3_secret"]},
            {"name": "S3_FORCE_PATH_STYLE",      "value": "false"},
            {"name": "AWS_REGION",               "value": region},
            {"name": "ECS_CLUSTER_NAME",         "value": args["cluster_name"]},
            {"name": "INGESTION_TASK_DEF_ARN",   "value": args["ingestion_task_arn"]},
            {"name": "PRIVATE_SUBNET_IDS",       "value": ",".join(args["private_subnet_ids"])},
            {"name": "ECS_SECURITY_GROUP_ID",    "value": args["ingestion_sg_id"]},
        ]))

        self.task_def = aws.ecs.TaskDefinition(
            f"{name}-task",
            family=f"{name}",
            requires_compatibilities=["FARGATE"],
            network_mode="awsvpc",
            cpu="512",
            memory="1024",
            execution_role_arn=base_infra.ecs_execution_role.arn,
            task_role_arn=self.task_role.arn,
            tags=self.tags,
            container_definitions=pulumi.Output.all(
                repo_url=self.repo.repository_url,
                env=container_env,
                log_group=self.log_group.name,
            ).apply(lambda args: json.dumps([{
                "name": "dashboard",
                "image": f"{args['repo_url']}:latest",
                "portMappings": [{"containerPort": 3000, "hostPort": 3000, "protocol": "tcp"}],
                "environment": json.loads(args["env"]),
                "logConfiguration": {
                    "logDriver": "awslogs",
                    "options": {
                        "awslogs-group": args["log_group"],
                        "awslogs-region": region,
                        "awslogs-stream-prefix": "ecs",
                    }
                }
            }])),
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 7. ECS Service ───────────────────────────────────────────────────
        self.service = aws.ecs.Service(
            f"{name}-service",
            cluster=base_infra.cluster.arn,
            task_definition=self.task_def.arn,
            desired_count=1,
            launch_type="FARGATE",
            deployment_minimum_healthy_percent=100,
            deployment_maximum_percent=200,
            deployment_circuit_breaker={
                "enable": True,
                "rollback": True,
            },
            network_configuration={
                "subnets": base_infra.vpc.private_subnet_ids,
                "security_groups": [self.ecs_sg.id],
                "assign_public_ip": False,
            },
            load_balancers=[{
                "target_group_arn": self.target_group.arn,
                "container_name": "dashboard",
                "container_port": 3000,
            }],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self, depends_on=[self.listener])
        )

        # ── 8. Outputs ───────────────────────────────────────────────────────
        self.service_url = pulumi.Output.format("http://{0}", self.alb.dns_name)

        self.register_outputs({
            "repo_url":    self.repo.repository_url,
            "service_url": self.service_url,
        })
