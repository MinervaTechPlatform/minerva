import pulumi
import pulumi_aws as aws

class CoreService(pulumi.ComponentResource):
    def __init__(self, name: str, env: str, base_infra, ingestion_task_def_arn: pulumi.Input[str], opts: pulumi.ResourceOptions = None):
        super().__init__("minerva:core:CoreService", name, {}, opts)

        self.tags = {
            "env": env,
            "component": "core"
        }

        # 1. ECR Repository for Core
        self.repo = aws.ecr.Repository(
            f"{name}-repo",
            force_delete=True,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 2. Ingestion Task Role (Permissions for triggering ingestion)
        self.task_role = aws.iam.Role(
            f"{name}-task-role",
            assume_role_policy='''{
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
            }''',
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        aws.iam.RolePolicy(
            f"{name}-ecs-run-task-policy",
            role=self.task_role.name,
            policy=pulumi.Output.all(base_infra.cluster.arn, f"arn:aws:ecs:{aws.get_region().name}:*:task-definition/*").apply(lambda args: f'''{{
                "Version": "2012-10-17",
                "Statement": [
                    {{
                        "Effect": "Allow",
                        "Action": [
                            "ecs:RunTask",
                            "iam:PassRole"
                        ],
                        "Resource": "*"
                    }}
                ]
            }}'''),
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 3. Log Group
        self.log_group = aws.cloudwatch.LogGroup(
            f"/ecs/{name}-log-group",
            retention_in_days=3,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 3. Load Balancer (ALB) for Core API
        self.alb_sg = aws.ec2.SecurityGroup(
            f"{name}-alb-sg",
            vpc_id=base_infra.vpc.vpc_id,
            ingress=[{"protocol": "tcp", "from_port": 80, "to_port": 80, "cidr_blocks": ["0.0.0.0/0"]}],
            egress=[{"protocol": "-1", "from_port": 0, "to_port": 0, "cidr_blocks": ["0.0.0.0/0"]}],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.alb = aws.lb.LoadBalancer(
            f"{name}-alb",
            security_groups=[self.alb_sg.id],
            subnets=base_infra.vpc.public_subnet_ids,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.target_group = aws.lb.TargetGroup(
            f"{name}-tg",
            port=8000,
            protocol="HTTP",
            vpc_id=base_infra.vpc.vpc_id,
            target_type="ip",
            health_check={
                "path": "/health",
                "healthy_threshold": 2,
                "unhealthy_threshold": 10,
                "timeout": 5,
                "interval": 10,
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
                "target_group_arn": self.target_group.arn
            }],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 4. ECS Service (0.5 vCPU, 1 GB RAM, as requested)
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
                db_url=base_infra.db_url,
                log_group=self.log_group.name,
                region=aws.get_region().name,
                cluster_name=base_infra.cluster.name,
                subnet_ids=base_infra.vpc.private_subnet_ids.apply(lambda ids: ",".join(ids)),
                ingest_arn=ingestion_task_def_arn,
                account_id=aws.get_caller_identity().account_id,
                env=env,
                sarvam_api_key=pulumi.Config().get_secret("sarvam_api_key") or ""
            ).apply(lambda args: f'''[
                {{
                    "name": "core",
                    "image": "{args["repo_url"]}:latest",
                    "portMappings": [{{"containerPort": 8000, "hostPort": 8000}}],
                    "environment": [
                        {{"name": "DATABASE_URL", "value": "{args["db_url"]}"}},
                        {{"name": "ENV", "value": "production"}},
                        {{"name": "ECS_CLUSTER_NAME", "value": "{args["cluster_name"]}"}},
                        {{"name": "PRIVATE_SUBNET_IDS", "value": "{args["subnet_ids"]}"}},
                        {{"name": "INGESTION_TASK_DEF_ARN", "value": "{args["ingest_arn"]}"}},
                        {{"name": "SARVAM_API_KEY", "value": "{args["sarvam_api_key"]}"}}
                    ],
                    "logConfiguration": {{
                         "logDriver": "awslogs",
                         "options": {{
                            "awslogs-group": "{args["log_group"]}",
                            "awslogs-region": "{args["region"]}",
                            "awslogs-stream-prefix": "ecs"
                         }}
                    }}
                }}
            ]'''),
            opts=pulumi.ResourceOptions(parent=self)
        )

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
                "security_groups": [base_infra.db_sg.id], # Reuse SG for internal traffic
                 "assign_public_ip": False 
            },
            tags=self.tags,
            load_balancers=[{
                "target_group_arn": self.target_group.arn,
                "container_name": "core",
                "container_port": 8000
            }],
            opts=pulumi.ResourceOptions(parent=self)
        )
        self.repo_url = self.repo.repository_url
        self.service_url = pulumi.Output.format(
            "http://{0}",
            self.alb.dns_name
        )
        self.register_outputs({
            "repo_url": self.repo_url,
            "service_url": self.service_url
        })
