SHELL := /bin/bash
# Minerva Infrastructure Management
# Usage: 
#   make setup AWS_ACCESS_KEY_ID=xxx AWS_SECRET_ACCESS_KEY=yyy PULUMI_CONFIG_PASSPHRASE=zzz

# Load environment variables from .env
ENV_FILE := .env
ifneq ("$(wildcard $(ENV_FILE))","")
include $(ENV_FILE)
export $(shell sed 's/=.*//' $(ENV_FILE))
endif

# --- Configuration ---
export AWS_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY
AWS_REGION ?= us-east-1
export AWS_REGION
export AWS_DEFAULT_REGION := $(AWS_REGION)
PULUMI_STATE_BUCKET ?= s3://minerva-infra-state
STACK ?= dev

# Deployment Environment for shell commands and recipes
DEPLOY_ENV := AWS_ACCESS_KEY_ID=$(AWS_ACCESS_KEY_ID) \
              AWS_SECRET_ACCESS_KEY=$(AWS_SECRET_ACCESS_KEY) \
              AWS_REGION=$(AWS_REGION) \
              AWS_DEFAULT_REGION=$(AWS_REGION) \
              PULUMI_CONFIG_PASSPHRASE=$(PULUMI_CONFIG_PASSPHRASE)

# --- Secrets (should be passed at runtime or as env vars) ---
# AWS_ACCESS_KEY_ID ?= 
# AWS_SECRET_ACCESS_KEY ?= 
# PULUMI_CONFIG_PASSPHRASE ?= 

# --- Targets ---

.PHONY: help
help:
	@echo "Available commands:"
	@echo "  make aws-config          - Configure AWS CLI"
	@echo "  make login               - Login to Pulumi S3 backend"
	@echo "  make init                - Initialize Pulumi stack"
	@echo "  make pulumi-config       - Set Pulumi config/secrets from .env"
	@echo "  make preview             - Preview all components"
	@echo "  make deploy              - Deploy all components"
	@echo "  make preview-dashboard   - Preview dashboard (ECS Fargate) only"
	@echo "  make deploy-dashboard    - Deploy dashboard (ECS Fargate) only"
	@echo "  make push-dashboard      - Build+push dashboard image & force ECS redeploy (no Pulumi)"
	@echo "  make push-core           - Build+push core image & force ECS redeploy (no Pulumi)"
	@echo "  make preview-core        - Preview core API only"
	@echo "  make deploy-core         - Deploy core API only"
	@echo "  make preview-ingestion   - Preview ingestion worker only"
	@echo "  make deploy-ingestion    - Deploy ingestion worker only"
	@echo "  make setup               - Run all steps (config -> login -> init -> pulumi-config -> deploy)"

.PHONY: aws-config
aws-config:
	@echo "Setting up AWS configuration..."
	@$(DEPLOY_ENV) aws configure set aws_access_key_id $(AWS_ACCESS_KEY_ID)
	@$(DEPLOY_ENV) aws configure set aws_secret_access_key $(AWS_SECRET_ACCESS_KEY)
	@$(DEPLOY_ENV) aws configure set default.region $(AWS_REGION)

.PHONY: login
login:
# 	@set -a; source .env; set +a;
	@echo "Logging into Pulumi backend: $(PULUMI_STATE_BUCKET)..."
	@$(DEPLOY_ENV) pulumi login $(PULUMI_STATE_BUCKET)

.PHONY: init
init: login
	@echo "Initializing stack: $(STACK)..."
	cd pulumi && ($(DEPLOY_ENV) pulumi stack init $(STACK) || echo "Stack already exists, proceeding...")

.PHONY: preview
preview: pulumi-config
	@echo "Previewing all infrastructure in stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --stack $(STACK)

.PHONY: deploy
deploy: pulumi-config
	@echo "Deploying infrastructure to stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --yes --stack $(STACK)

# Component-specific previews and deploys — target one service using Pulumi --target
# (This prevents deleting other components like config overrides would)

.PHONY: pulumi-config
pulumi-config: login
	@echo "Setting Pulumi config and secrets for stack: $(STACK)..."
	@cd pulumi && $(DEPLOY_ENV) pulumi config set --secret minerva:auth_secret "$(AUTH_SECRET)" --stack $(STACK)
	@cd pulumi && $(DEPLOY_ENV) pulumi config set --secret minerva:auth_google_id "$(AUTH_GOOGLE_ID)" --stack $(STACK)
	@cd pulumi && $(DEPLOY_ENV) pulumi config set --secret minerva:auth_google_secret "$(AUTH_GOOGLE_SECRET)" --stack $(STACK)
	@echo "Pulumi config set successfully."

.PHONY: preview-dashboard
preview-dashboard: pulumi-config
	@echo "Previewing dashboard only in stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --stack $(STACK) \
		--target "**minerva-$(STACK)-dashboard**" --target-dependents

.PHONY: deploy-dashboard
deploy-dashboard: pulumi-config
	@echo "Deploying dashboard only to stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --yes --stack $(STACK) \
		--target "**minerva-$(STACK)-dashboard**" --target-dependents

.PHONY: preview-core
preview-core: pulumi-config
	@echo "Previewing core API only in stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --stack $(STACK) \
		--target "**minerva-$(STACK)-core**" --target-dependents

.PHONY: deploy-core
deploy-core: pulumi-config
	@echo "Deploying core API only to stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --yes --stack $(STACK) \
		--target "**minerva-$(STACK)-core**" --target-dependents

.PHONY: preview-ingestion
preview-ingestion: pulumi-config
	@echo "Previewing ingestion worker only in stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --stack $(STACK) \
		--target "**minerva-$(STACK)-ingestion**" --target-dependents

.PHONY: deploy-ingestion
deploy-ingestion: pulumi-config
	@echo "Deploying ingestion worker only to stack: $(STACK)..."
	cd pulumi && $(DEPLOY_ENV) pulumi up --yes --stack $(STACK) \
		--target "**minerva-$(STACK)-ingestion**" --target-dependents

.PHONY: setup
setup: aws-config init pulumi-config deploy
	@echo "Deployment complete."

.PHONY: destroy
destroy: login
	@echo "Destroying infrastructure for stack: $(STACK)..."
# 	@set -a; source .env; set +a;
	cd pulumi && $(DEPLOY_ENV) pulumi destroy --yes --stack $(STACK)

.PHONY: delete-stack
delete-stack:
	@echo "Deleting stack: $(STACK)..."
# 	@set -a; source .env; set +a;
	cd pulumi && $(DEPLOY_ENV) pulumi stack rm $(STACK) --yes

.PHONY: nuke-stack
nuke-stack:
	@echo "Nuking stack: $(STACK)..."
	destroy delete-stack

# --- Docker Push Commands ---

.PHONY: push-core
push-core: login
	@echo "Pushing Core Service to ECR and force-redeploying ECS..."
	$(eval CORE_REPO := $(shell cd pulumi && $(DEPLOY_ENV) pulumi stack output core_repo_url --stack $(STACK) 2>/dev/null))
	@if [ -z "$(CORE_REPO)" ]; then \
		echo "Error: core_repo_url not found in stack outputs. Have you run 'make deploy' yet?"; \
		exit 1; \
	fi
	@$(DEPLOY_ENV) aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(CORE_REPO) || \
		(echo "Error: AWS ECR login failed."; exit 1)
	docker build --platform linux/amd64 -t $(CORE_REPO):latest -f docker/Dockerfile.core ..
	docker push $(CORE_REPO):latest
	$(eval CLUSTER := $(shell $(DEPLOY_ENV) aws ecs list-clusters --region $(AWS_REGION) --query 'clusterArns[?contains(@, `minerva-$(STACK)`)] | [0]' --output text 2>/dev/null))
	$(eval SERVICE := $(shell $(DEPLOY_ENV) aws ecs list-services --cluster $(CLUSTER) --region $(AWS_REGION) --query 'serviceArns[?contains(@, `core`)] | [0]' --output text 2>/dev/null))
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: Could not find core ECS service. Have you run 'make deploy-core' yet?"; \
		exit 1; \
	fi
	@echo "Force-redeploying ECS service: $(SERVICE)"
	@$(DEPLOY_ENV) aws ecs update-service \
		--cluster $(CLUSTER) \
		--service $(SERVICE) \
		--force-new-deployment \
		--region $(AWS_REGION) \
		--no-cli-pager \
		--query 'service.{status:status,desiredCount:desiredCount,runningCount:runningCount}' \
		--output table
	@echo "Core deploy triggered. Monitor progress: aws ecs describe-services --cluster $(CLUSTER) --services $(SERVICE) --region $(AWS_REGION)"
	

.PHONY: push-ingestion
push-ingestion: login
	@echo "Pushing Ingestion Worker to ECR..."
	$(eval INGESTION_REPO := $(shell cd pulumi && $(DEPLOY_ENV) pulumi stack output ingestion_repo_url --stack $(STACK) 2>/dev/null))
	@if [ -z "$(INGESTION_REPO)" ]; then \
		echo "Error: ingestion_repo_url not found in stack outputs. Have you run 'make deploy' yet?"; \
		exit 1; \
	fi
	@$(DEPLOY_ENV) aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(INGESTION_REPO) || \
		(echo "Error: AWS ECR login failed. Ensure your IAM user has 'ecr:GetAuthorizationToken' permissions."; exit 1)
	docker build --platform linux/amd64 -t $(INGESTION_REPO):latest -f docker/Dockerfile.ingestion ..
	docker push $(INGESTION_REPO):latest

.PHONY: push-dashboard
push-dashboard: login
	@echo "Pushing Dashboard to ECR and force-redeploying ECS..."
	$(eval DASH_REPO := $(shell cd pulumi && $(DEPLOY_ENV) pulumi stack output dashboard_repo_url --stack $(STACK) 2>/dev/null))
	@if [ -z "$(DASH_REPO)" ]; then \
		echo "Error: dashboard_repo_url not found in stack outputs. Have you run 'make deploy' yet?"; \
		exit 1; \
	fi
	@$(DEPLOY_ENV) aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(DASH_REPO) || \
		(echo "Error: AWS ECR login failed."; exit 1)
	docker build --platform linux/amd64 -t $(DASH_REPO):latest -f docker/Dockerfile.dashboard ..
	docker push $(DASH_REPO):latest
	$(eval CLUSTER := $(shell $(DEPLOY_ENV) aws ecs list-clusters --region $(AWS_REGION) --query 'clusterArns[?contains(@, `minerva-$(STACK)`)] | [0]' --output text 2>/dev/null))
	$(eval SERVICE := $(shell $(DEPLOY_ENV) aws ecs list-services --cluster $(CLUSTER) --region $(AWS_REGION) --query 'serviceArns[?contains(@, `dashboard`)] | [0]' --output text 2>/dev/null))
	@if [ -z "$(SERVICE)" ]; then \
		echo "Error: Could not find dashboard ECS service. Have you run 'make deploy-dashboard' yet?"; \
		exit 1; \
	fi
	@echo "Force-redeploying ECS service: $(SERVICE)"
	@$(DEPLOY_ENV) aws ecs update-service \
		--cluster $(CLUSTER) \
		--service $(SERVICE) \
		--force-new-deployment \
		--region $(AWS_REGION) \
		--no-cli-pager \
		--query 'service.{status:status,desiredCount:desiredCount,runningCount:runningCount}' \
		--output table
	@echo "Dashboard deploy triggered. Monitor progress: aws ecs describe-services --cluster $(CLUSTER) --services $(SERVICE) --region $(AWS_REGION)"

.PHONY: push
push: push-core push-ingestion push-dashboard
	@echo "All services pushed to ECR."
