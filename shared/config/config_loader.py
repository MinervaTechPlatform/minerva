import os
import boto3
from botocore.config import Config
from shared.utils.logging import get_logger

logger = get_logger("shared.config.config_loader")

_config_cache = None

def get_config() -> dict[str, str]:
    """
    Fetch all parameters from AWS SSM Parameter Store under the environment prefix.
    Load them into os.environ, cache the result, and return as a dictionary.
    """
    global _config_cache
    if _config_cache is not None:
        return _config_cache

    # Fallback to dev if ENV isn't supplied
    env = os.environ.get("ENV", "dev") 
    region = os.environ.get("AWS_REGION", "us-east-1")
    prefix = f"/minerva/{env}/"
    
    # Configure boto3 client with 3 retries
    boto_config = Config(
        region_name=region,
        retries={'max_attempts': 3, 'mode': 'standard'}
    )
    
    try:
        ssm = boto3.client('ssm', config=boto_config)
        paginator = ssm.get_paginator('get_parameters_by_path')
        response_iterator = paginator.paginate(
            Path=prefix,
            Recursive=True,
            WithDecryption=True
        )
        
        loaded_params = {}
        count = 0
        for page in response_iterator:
            for param in page.get('Parameters', []):
                name = param['Name']
                value = param['Value']
                
                # Strip prefix to get env var name
                if name.startswith(prefix):
                    env_var_name = name[len(prefix):]
                else:
                    env_var_name = name.split('/')[-1]
                
                # Load into os.environ
                os.environ[env_var_name] = value
                loaded_params[env_var_name] = value
                count += 1
                
        logger.info(f"Loaded {count} configuration parameters from SSM Parameter Store (prefix: {prefix})")
        _config_cache = loaded_params
        return _config_cache
        
    except Exception as e:
        logger.error(f"Failed to load configuration from SSM Parameter Store: {e}")
        # Fail fast per requirements
        raise RuntimeError(f"Config load failed: {e}") from e
