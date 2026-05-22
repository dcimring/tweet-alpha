#!/usr/bin/env python3
import os
import sys
import argparse

# Suppress stderr during import to avoid LiteLLM/Boto3 warnings
class SilenceStderr:
    def __enter__(self):
        self._original_stderr = sys.stderr
        sys.stderr = open(os.devnull, 'w')
    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stderr.close()
        sys.stderr = self._original_stderr

with SilenceStderr():
    import litellm
    from genai_prices import calc_price, Usage

# Curated list of top/popular models from major providers
CURATED_MODELS = [
    # OpenAI
    "gpt-4o",
    "gpt-4o-mini",
    "o1",
    "o3-mini",
    # Anthropic
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
    "claude-3-opus-20240229",
    "anthropic.claude-3-5-sonnet-20241022-v2:0",
    # Google Gemini
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini/gemini-1.5-flash",
    # xAI
    "xai/grok-2",
    "xai/grok-4-1-fast-non-reasoning",
    # DeepSeek
    "deepseek-chat",
    "deepseek-reasoner",
    # Mistral
    "mistral/mistral-large-latest",
    "mistral/mistral-small-latest",
    # Cohere
    "command-r-plus",
    "command-r"
]

def format_cost(cost_per_million):
    """Format cost per million tokens with appropriate decimal precision."""
    if cost_per_million == 0:
        return "$0.00"
    elif cost_per_million < 0.01:
        return f"${cost_per_million:.6f}"
    elif cost_per_million < 0.1:
        return f"${cost_per_million:.4f}"
    else:
        return f"${cost_per_million:.2f}"

def format_tokens(tokens):
    """Format context window sizes nicely."""
    if not tokens or tokens == 0:
        return "N/A"
    return f"{tokens:,}"

def extract_model_info(model_name, info):
    """Extract standard fields from a litellm model cost metadata dictionary, attempting to use genai-prices first."""
    try:
        # Attempt to query genai-prices for exact cost per million tokens
        p = calc_price(Usage(input_tokens=1_000_000, output_tokens=1_000_000), model_name)
        input_million = float(p.input_price)
        output_million = float(p.output_price)
        provider = p.provider.id
    except Exception:
        # Fallback to LiteLLM's internal model_cost database
        provider = info.get("litellm_provider")
        if not provider:
            if "/" in model_name:
                provider = model_name.split("/")[0]
            else:
                provider = "unknown"
                
        input_cost = info.get("input_cost_per_token")
        output_cost = info.get("output_cost_per_token")
        input_million = input_cost * 1_000_000 if input_cost is not None else 0.0
        output_million = output_cost * 1_000_000 if output_cost is not None else 0.0
            
    # Clean provider names for consistent display
    provider = provider.lower().replace("_ai", "").replace("-language-models", "")
    
    raw_max_tokens = info.get("max_tokens") or info.get("max_input_tokens") or info.get("max_output_tokens") or 0
    try:
        max_tokens = int(float(raw_max_tokens))
    except (ValueError, TypeError):
        max_tokens = 0
    
    return {
        "model": model_name,
        "provider": provider,
        "input_million": input_million,
        "output_million": output_million,
        "max_tokens": max_tokens
    }

def print_table(rows, title):
    """Render a beautifully formatted ASCII table of model costs."""
    if not rows:
        print(f"\nNo models found in current view ({title}).")
        return

    # Calculate column widths dynamically
    col_widths = {
        "provider": max(len("PROVIDER"), max(len(r["provider"]) for r in rows)),
        "model": max(len("MODEL NAME"), max(len(r["model"]) for r in rows)),
        "input": max(len("INPUT ($/M)"), max(len(format_cost(r["input_million"])) for r in rows)),
        "output": max(len("OUTPUT ($/M)"), max(len(format_cost(r["output_million"])) for r in rows)),
        "tokens": max(len("MAX TOKENS"), max(len(format_tokens(r["max_tokens"])) for r in rows))
    }
    
    # Table dividers
    divider = (
        f"+-{'-' * col_widths['provider']}-+-"
        f"{'-' * col_widths['model']}-+-"
        f"{'-' * col_widths['input']}-+-"
        f"{'-' * col_widths['output']}-+-"
        f"{'-' * col_widths['tokens']}-+"
    )
    
    # Print Title Header
    print(f"\n=== {title.upper()} ===")
    print(divider)
    
    # Print Headers
    header_str = (
        f"| {'PROVIDER':<{col_widths['provider']}} | "
        f"{'MODEL NAME':<{col_widths['model']}} | "
        f"{'INPUT ($/M)':>{col_widths['input']}} | "
        f"{'OUTPUT ($/M)':>{col_widths['output']}} | "
        f"{'MAX TOKENS':>{col_widths['tokens']}} |"
    )
    print(header_str)
    print(divider)
    
    # Print Rows
    for r in rows:
        row_str = (
            f"| {r['provider']:<{col_widths['provider']}} | "
            f"{r['model']:<{col_widths['model']}} | "
            f"{format_cost(r['input_million']):>{col_widths['input']}} | "
            f"{format_cost(r['output_million']):>{col_widths['output']}} | "
            f"{format_tokens(r['max_tokens']):>{col_widths['tokens']}} |"
        )
        print(row_str)
        
    print(divider)
    
    # Calculate summary metrics
    total_models = len(rows)
    non_free_input = [r["input_million"] for r in rows if r["input_million"] > 0]
    non_free_output = [r["output_million"] for r in rows if r["output_million"] > 0]
    
    avg_input = sum(non_free_input) / len(non_free_input) if non_free_input else 0.0
    avg_output = sum(non_free_output) / len(non_free_output) if non_free_output else 0.0
    
    max_input_model = max(rows, key=lambda x: x["input_million"]) if rows else None
    
    print("\n--- SUMMARY INFO ---")
    print(f"Total Models in View:  {total_models}")
    print(f"Avg Input Cost/Million: {format_cost(avg_input)} (excluding free)")
    print(f"Avg Output Cost/Million:{format_cost(avg_output)} (excluding free)")
    if max_input_model and max_input_model["input_million"] > 0:
        print(f"Most Expensive Model:  {max_input_model['model']} ({format_cost(max_input_model['input_million'])}/M input)")
    print("=" * (len(divider) if len(divider) < 80 else 80))

def main():
    parser = argparse.ArgumentParser(
        description="LiteLLM Model Token Cost Viewer Utility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python model_costs.py
  python model_costs.py --provider openai
  python model_costs.py --search grok
  python model_costs.py --all --sort input
        """
    )
    parser.add_argument(
        "--provider",
        help="Filter models by provider (e.g. openai, anthropic, gemini, xai, deepseek, mistral)"
    )
    parser.add_argument(
        "--search",
        help="Case-insensitive search query for model name"
    )
    parser.add_argument(
        "--sort",
        choices=["provider", "model", "input", "output", "tokens"],
        default="provider",
        help="Sort the resulting table by a specific field (default: provider)"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Show all available models in the LiteLLM database instead of only top/curated models"
    )
    
    args = parser.parse_args()
    
    # Parse LiteLLM model database
    try:
        model_costs = litellm.model_cost
    except AttributeError:
        print("Error: LiteLLM installation is missing the model_cost database.", file=sys.stderr)
        sys.exit(1)
        
    all_rows = []
    
    # Extract records
    for model_name, info in model_costs.items():
        if not isinstance(info, dict):
            continue
        row = extract_model_info(model_name, info)
        all_rows.append(row)
        
    # Filter by top models if not --all
    if not args.all:
        # Include explicitly curated models or any model containing exact names from curated list
        rows = [r for r in all_rows if r["model"] in CURATED_MODELS]
        title = "Top LiteLLM Models"
    else:
        rows = all_rows
        title = "All LiteLLM Models"
        
    # Filter by provider
    if args.provider:
        prov_query = args.provider.lower()
        rows = [r for r in rows if prov_query in r["provider"]]
        title += f" (Provider: {args.provider})"
        
    # Filter by search term
    if args.search:
        search_query = args.search.lower()
        rows = [r for r in rows if search_query in r["model"].lower()]
        title += f" (Search: {args.search})"
        
    # Sort the rows
    if args.sort == "provider":
        rows.sort(key=lambda x: (x["provider"], x["model"]))
    elif args.sort == "model":
        rows.sort(key=lambda x: x["model"])
    elif args.sort == "input":
        rows.sort(key=lambda x: x["input_million"], reverse=True)
    elif args.sort == "output":
        rows.sort(key=lambda x: x["output_million"], reverse=True)
    elif args.sort == "tokens":
        rows.sort(key=lambda x: x["max_tokens"], reverse=True)
        
    # Render table
    print_table(rows, title)

if __name__ == "__main__":
    main()
