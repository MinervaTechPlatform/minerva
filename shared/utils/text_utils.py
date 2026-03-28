import re

def strip_thought_blocks(text: str) -> str:
    """
    Strips content enclosed in <think>...</think> tags from text.
    Handles both single-line and multi-line blocks.
    
    Args:
        text: The input text potentially containing <think> blocks.
        
    Returns:
        The cleaned text with <think> blocks removed.
    """
    if not text:
        return text
    
    # Use re.DOTALL to match across multiple lines
    # Using a non-greedy match (.*?) to handle multiple separate think blocks
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    
    return cleaned.strip()
