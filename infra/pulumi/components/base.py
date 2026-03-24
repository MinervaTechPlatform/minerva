import pulumi
import pulumi_aws as aws
import pulumi_awsx as awsx
import pulumi_random as random


class BaseInfra(pulumi.ComponentResource):
    def __init__(self, name: str, env: str, opts: pulumi.ResourceOptions = None):
        super().__init__("minerva:base:BaseInfra", name, {}, opts)
        
        self.tags = {
            "env": env,
            "component": "base"
        }
        self.vpc = awsx.ec2.Vpc(
            f"{name}-vpc",
            number_of_availability_zones=2,
            nat_gateways=awsx.ec2.NatGatewayConfigurationArgs(
                strategy="Single"
            ),
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 2. Shared ECS Cluster
        self.cluster = aws.ecs.Cluster(
            f"{name}-cluster",
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 3. S3 Bucket for Documents
        self.bucket = aws.s3.Bucket(
            f"{name}-documents",
            force_destroy=True, # Allow cleanup in dev
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 4. Minimal RDS Instance (t4g.micro for dev cost savings)
        self.db_password = random.RandomPassword(
            f"{name}-db-password",
            length=16,
            special=True,
            override_special="_",
        )

        self.db_subnet_group = aws.rds.SubnetGroup(
            f"{name}-db-subnets",
            subnet_ids=self.vpc.private_subnet_ids,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # 5. Security Group for Public-facing components (e.g. Dashboard)
        # This allows us to avoid hardcoding CIDRs and use SG nesting
        self.public_assets_sg = aws.ec2.SecurityGroup(
            f"{name}-public-assets-sg",
            vpc_id=self.vpc.vpc_id,
            description="Security Group for public-facing assets like Dashboard",
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.db_sg = aws.ec2.SecurityGroup(
            f"{name}-db-sg",
            vpc_id=self.vpc.vpc_id,
            description="Allow Postgres access from Public Subnets only",
            ingress=[
                {
                    "protocol": "tcp",
                    "from_port": 5432,
                    "to_port": 5432,
                    # We allow the specific Security Group of your dashboard component.
                    # When you deploy your dashboard on EC2 or ECS, simply attach 
                    # 'public_assets_sg' to it.
                    "security_groups": [self.public_assets_sg.id],
                }
            ],
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.db = aws.rds.Instance(
            f"{name}-db",
            allocated_storage=20,
            engine="postgres",
            engine_version="15",
            instance_class="db.t4g.micro",
            db_name="minerva",
            username="postgres",
            password=self.db_password.result,
            db_subnet_group_name=self.db_subnet_group.name,
            vpc_security_group_ids=[self.db_sg.id],
            multi_az=False,
            publicly_accessible=False,
            skip_final_snapshot=True,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self, depends_on=[self.db_subnet_group])
        )

        # Output the DB connectivity string for components
        self.db_url = pulumi.Output.format(
            "postgresql://postgres:{0}@{1}:5432/minerva",
            self.db_password.result,
            self.db.address
        )

        # 5. Global Roles (ECS Execution)
        self.ecs_execution_role = aws.iam.Role(
            f"{name}-ecs-execution-role",
            assume_role_policy='''{
                "Version": "2012-10-17",
                "Statement": [{"Effect": "Allow", "Principal": {"Service": "ecs-tasks.amazonaws.com"}, "Action": "sts:AssumeRole"}]
            }''',
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )
        aws.iam.RolePolicyAttachment(
            f"{name}-exec-policy",
            role=self.ecs_execution_role.name,
            policy_arn="arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy",
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.register_outputs({
            "vpc_id": self.vpc.vpc_id,
            "cluster_arn": self.cluster.arn,
            "bucket_name": self.bucket.id,
            "db_address": self.db.address,
            "db_url": self.db_url,
            "public_assets_sg_id": self.public_assets_sg.id
        })
