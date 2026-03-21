import json
import pulumi
import pulumi_aws as aws


class DashboardApp(pulumi.ComponentResource):
    def __init__(self, name: str, env: str, base_infra, opts: pulumi.ResourceOptions = None):
        super().__init__("minerva:dashboard:DashboardApp", name, {}, opts)

        config = pulumi.Config()
        aws_config = pulumi.Config("aws")
        region = aws_config.get("region") or "us-east-1"

        github_token = config.require_secret("github_token")
        github_repo = config.require("github_repo")
        auth_secret = config.require_secret("auth_secret")
        auth_google_id = config.require_secret("auth_google_id")
        auth_google_secret = config.require_secret("auth_google_secret")

        self.tags = {
            "env": env,
            "component": "dashboard"
        }

        # ── 1. IAM Service Role for Amplify ─────────────────────────────────
        self.amplify_role = aws.iam.Role(
            f"{name}-amplify-role",
            assume_role_policy=json.dumps({
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow",
                    "Principal": {"Service": "amplify.amazonaws.com"},
                    "Action": "sts:AssumeRole"
                }]
            }),
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )
        aws.iam.RolePolicyAttachment(
            f"{name}-amplify-policy",
            role=self.amplify_role.name,
            policy_arn="arn:aws:iam::aws:policy/AdministratorAccess-Amplify",
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 2. Dedicated IAM User for Dashboard S3 Access ───────────────────
        self.s3_user = aws.iam.User(
            f"{name}-s3-user",
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # Inline policy: scoped to the documents bucket only
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
                        "Action": [
                            "s3:GetObject",
                            "s3:PutObject",
                            "s3:DeleteObject"
                        ],
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

        # ── 3. Amplify App ───────────────────────────────────────────────────
        # Build env vars (merged Output so all secrets resolve properly)
        env_vars = pulumi.Output.all(
            db_url=base_infra.db_url,
            bucket_name=base_infra.bucket.id,
            auth_secret=auth_secret,
            auth_google_id=auth_google_id,
            auth_google_secret=auth_google_secret,
            s3_key_id=self.s3_access_key.id,
            s3_secret=self.s3_access_key.secret,
        ).apply(lambda args: {
            "DATABASE_URL":          args["db_url"],
            "AUTH_SECRET":           args["auth_secret"],
            "AUTH_GOOGLE_ID":        args["auth_google_id"],
            "AUTH_GOOGLE_SECRET":    args["auth_google_secret"],
            "S3_ENDPOINT":           f"https://s3.{region}.amazonaws.com",
            "S3_REGION":             region,
            "S3_BUCKET":             args["bucket_name"],
            "S3_ACCESS_KEY_ID":      args["s3_key_id"],
            "S3_SECRET_ACCESS_KEY":  args["s3_secret"],
            "S3_FORCE_PATH_STYLE":   "false",
        })

        self.app = aws.amplify.App(
            f"{name}-amplify",
            name=f"minerva-{env}-dashboard",
            repository=github_repo,
            oauth_token=github_token,
            iam_service_role_arn=self.amplify_role.arn,
            # amplify.yml at repo root drives the build; no inline build_spec needed
            environment_variables=env_vars,
            # SSR / server-side rendering support for Next.js
            platform="WEB_COMPUTE",
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 4. Branches ──────────────────────────────────────────────────────
        self.develop_branch = aws.amplify.Branch(
            f"{name}-branch-develop",
            app_id=self.app.id,
            branch_name="develop",
            stage="DEVELOPMENT",
            enable_auto_build=True,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        self.gowtham_branch = aws.amplify.Branch(
            f"{name}-branch-gowtham",
            app_id=self.app.id,
            branch_name="gowtham_dashboard",
            stage="DEVELOPMENT",
            enable_auto_build=True,
            tags=self.tags,
            opts=pulumi.ResourceOptions(parent=self)
        )

        # ── 5. Outputs ───────────────────────────────────────────────────────
        self.app_id = self.app.id
        self.default_domain = self.app.default_domain

        self.develop_url = pulumi.Output.format(
            "https://develop.{0}.amplifyapp.com", self.app.id
        )
        self.gowtham_url = pulumi.Output.format(
            "https://gowtham--dashboard.{0}.amplifyapp.com", self.app.id
        )

        self.register_outputs({
            "app_id":            self.app_id,
            "default_domain":    self.default_domain,
            "develop_url":       self.develop_url,
            "gowtham_url":       self.gowtham_url,
        })
