#!/usr/bin/env python3
"""
PluginRadar Research Agent - Built with Claude Agent SDK

An autonomous agent for researching, enriching, and comparing DSP plugins.
Uses subagents for specialized tasks like competitive analysis and feature extraction.

Usage:
    python plugin-research-agent.py "Research FabFilter Pro-Q 4"
    python plugin-research-agent.py --compare "Pro-Q 4" "Kirchhoff-EQ"
    python plugin-research-agent.py --enrich "plugin-slug"
    python plugin-research-agent.py --trending

The agent will automatically use tools to:
- Search the web for plugin information
- Read/write local data files
- Query the Convex database
- Generate comparison reports
"""

import argparse
import json
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from claude_agents import Agent
from claude_agents.tools import Tool
from claude_agents.hooks import PreToolUseHook, PostToolUseHook

# =============================================================================
# Configuration
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
COMPARISONS_DIR = DATA_DIR / "comparisons"
ENRICHMENT_DIR = DATA_DIR / "enrichment"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
COMPARISONS_DIR.mkdir(exist_ok=True)
ENRICHMENT_DIR.mkdir(exist_ok=True)

# =============================================================================
# Hooks for Observability
# =============================================================================

class PluginRadarLoggingHook(PreToolUseHook, PostToolUseHook):
    """Log all agent tool usage for debugging and observability."""
    
    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.tool_calls = []
        self.start_times = {}
    
    async def execute(self, context):
        import time
        
        if hasattr(context, 'tool_output'):
            # PostToolUseHook
            elapsed = time.time() - self.start_times.get(context.tool_name, time.time())
            status = "✓" if context.success else "✗"
            print(f"  {status} {context.tool_name} ({elapsed:.2f}s)")
            
            if self.verbose and context.tool_output:
                output_str = str(context.tool_output)[:200]
                print(f"    → {output_str}...")
                
            self.tool_calls.append({
                "tool": context.tool_name,
                "success": context.success,
                "elapsed": elapsed
            })
        else:
            # PreToolUseHook
            self.start_times[context.tool_name] = time.time()
            if self.verbose:
                print(f"  ⟳ {context.tool_name}: {context.tool_input}")
        
        return context
    
    def summary(self):
        """Print tool usage summary."""
        total = len(self.tool_calls)
        successful = sum(1 for t in self.tool_calls if t["success"])
        total_time = sum(t["elapsed"] for t in self.tool_calls)
        print(f"\n📊 Tool Summary: {successful}/{total} successful, {total_time:.2f}s total")


class SafetyHook(PreToolUseHook):
    """Validate tool inputs for safety."""
    
    async def execute(self, context):
        # Block dangerous bash commands
        if context.tool_name == "execute_bash":
            command = context.tool_input.get("command", "")
            dangerous = ["rm -rf", "mkfs", "> /dev/", "sudo"]
            if any(d in command for d in dangerous):
                raise PermissionError(f"Blocked dangerous command: {command}")
        
        # Ensure file operations stay in project directory
        if context.tool_name in ["read_file", "write_file"]:
            path = context.tool_input.get("path", "")
            if ".." in path:
                raise ValueError("Directory traversal not allowed")
        
        return context


# =============================================================================
# Custom Tools
# =============================================================================

def web_search(query: str, max_results: int = 5) -> dict:
    """
    Search the web using Brave Search API via openclaw.
    Returns structured search results.
    """
    try:
        # Use the openclaw web_search internally via subprocess
        result = subprocess.run(
            ["openclaw", "tool", "web_search", "--query", query, "--count", str(max_results)],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            return {
                "success": True,
                "query": query,
                "results": json.loads(result.stdout) if result.stdout else []
            }
        
        # Fallback: use curl with Brave API directly
        import os
        brave_key = os.getenv("BRAVE_API_KEY", "")
        if brave_key:
            curl_result = subprocess.run(
                [
                    "curl", "-s",
                    f"https://api.search.brave.com/res/v1/web/search?q={query}&count={max_results}",
                    "-H", f"X-Subscription-Token: {brave_key}"
                ],
                capture_output=True,
                text=True,
                timeout=30
            )
            if curl_result.returncode == 0:
                data = json.loads(curl_result.stdout)
                return {
                    "success": True,
                    "query": query,
                    "results": [
                        {"title": r.get("title"), "url": r.get("url"), "snippet": r.get("description")}
                        for r in data.get("web", {}).get("results", [])
                    ]
                }
        
        return {"success": False, "error": "Search failed", "query": query}
        
    except Exception as e:
        return {"success": False, "error": str(e), "query": query}


def fetch_url(url: str, max_chars: int = 10000) -> dict:
    """
    Fetch and extract readable content from a URL.
    """
    try:
        result = subprocess.run(
            ["openclaw", "tool", "web_fetch", "--url", url, "--max-chars", str(max_chars)],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            return {
                "success": True,
                "url": url,
                "content": result.stdout[:max_chars]
            }
        
        # Fallback: use curl + html2text
        curl_result = subprocess.run(
            ["curl", "-sL", "--max-time", "30", url],
            capture_output=True,
            text=True,
            timeout=35
        )
        
        if curl_result.returncode == 0:
            # Basic HTML stripping
            import re
            content = re.sub(r'<script[^>]*>.*?</script>', '', curl_result.stdout, flags=re.DOTALL | re.IGNORECASE)
            content = re.sub(r'<style[^>]*>.*?</style>', '', content, flags=re.DOTALL | re.IGNORECASE)
            content = re.sub(r'<[^>]+>', ' ', content)
            content = re.sub(r'\s+', ' ', content).strip()
            return {
                "success": True,
                "url": url,
                "content": content[:max_chars]
            }
        
        return {"success": False, "error": "Fetch failed", "url": url}
        
    except Exception as e:
        return {"success": False, "error": str(e), "url": url}


def query_convex(query_name: str, args: dict = None) -> dict:
    """
    Query the PluginRadar Convex database.
    
    Available queries:
    - plugins:list - List all plugins (with optional filters)
    - plugins:get - Get single plugin by ID or slug
    - plugins:search - Search plugins by name
    - manufacturers:list - List all manufacturers
    - comparisons:list - List generated comparisons
    """
    try:
        convex_url = "https://next-frog-231.convex.cloud"
        
        # Map query names to Convex functions
        query_map = {
            "plugins:list": "plugins:list",
            "plugins:get": "plugins:get",
            "plugins:search": "plugins:search",
            "manufacturers:list": "manufacturers:list",
            "comparisons:list": "comparisons:list",
        }
        
        func_name = query_map.get(query_name)
        if not func_name:
            return {"success": False, "error": f"Unknown query: {query_name}"}
        
        # Use convex CLI
        cmd = ["npx", "convex", "run", func_name]
        if args:
            cmd.extend(["--", json.dumps(args)])
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=30
        )
        
        if result.returncode == 0:
            return {
                "success": True,
                "query": query_name,
                "data": json.loads(result.stdout) if result.stdout.strip() else None
            }
        
        return {"success": False, "error": result.stderr, "query": query_name}
        
    except Exception as e:
        return {"success": False, "error": str(e), "query": query_name}


def read_file(path: str) -> dict:
    """Read a file from the project directory."""
    try:
        # Resolve relative to project root
        file_path = Path(path)
        if not file_path.is_absolute():
            file_path = PROJECT_ROOT / path
        
        if not file_path.exists():
            return {"success": False, "error": f"File not found: {path}"}
        
        content = file_path.read_text()
        return {
            "success": True,
            "path": str(file_path),
            "content": content,
            "size": len(content)
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "path": path}


def write_file(path: str, content: str) -> dict:
    """Write content to a file in the project directory."""
    try:
        file_path = Path(path)
        if not file_path.is_absolute():
            file_path = PROJECT_ROOT / path
        
        # Ensure parent directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content)
        
        return {
            "success": True,
            "path": str(file_path),
            "size": len(content)
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "path": path}


def execute_bash(command: str, timeout: int = 30) -> dict:
    """Execute a bash command safely."""
    try:
        result = subprocess.run(
            ["bash", "-c", command],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(PROJECT_ROOT)
        )
        
        return {
            "success": result.returncode == 0,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
        
    except subprocess.TimeoutExpired:
        return {"success": False, "error": f"Command timed out after {timeout}s"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def save_enrichment(plugin_slug: str, data: dict) -> dict:
    """Save enriched plugin data to the enrichment directory."""
    try:
        file_path = ENRICHMENT_DIR / f"{plugin_slug}.json"
        
        # Merge with existing data if present
        existing = {}
        if file_path.exists():
            existing = json.loads(file_path.read_text())
        
        merged = {**existing, **data, "updated_at": datetime.now().isoformat()}
        file_path.write_text(json.dumps(merged, indent=2))
        
        return {
            "success": True,
            "path": str(file_path),
            "plugin_slug": plugin_slug
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "plugin_slug": plugin_slug}


def save_comparison(slug: str, comparison_data: dict) -> dict:
    """Save a plugin comparison to the comparisons directory."""
    try:
        file_path = COMPARISONS_DIR / f"{slug}.json"
        comparison_data["generated_at"] = datetime.now().isoformat()
        file_path.write_text(json.dumps(comparison_data, indent=2))
        
        return {
            "success": True,
            "path": str(file_path),
            "slug": slug
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "slug": slug}


# =============================================================================
# Tool Definitions
# =============================================================================

TOOLS = [
    Tool(
        name="web_search",
        description="Search the web for information about DSP plugins, manufacturers, reviews, tutorials, etc.",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query (e.g., 'FabFilter Pro-Q 4 review')"},
                "max_results": {"type": "integer", "description": "Max results (1-10)", "default": 5}
            },
            "required": ["query"]
        },
        function=web_search
    ),
    
    Tool(
        name="fetch_url",
        description="Fetch and extract readable content from a URL (plugin page, review, documentation)",
        input_schema={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
                "max_chars": {"type": "integer", "description": "Max characters to return", "default": 10000}
            },
            "required": ["url"]
        },
        function=fetch_url
    ),
    
    Tool(
        name="query_convex",
        description="Query the PluginRadar Convex database for plugins, manufacturers, etc.",
        input_schema={
            "type": "object",
            "properties": {
                "query_name": {
                    "type": "string",
                    "enum": ["plugins:list", "plugins:get", "plugins:search", "manufacturers:list", "comparisons:list"],
                    "description": "Query to execute"
                },
                "args": {"type": "object", "description": "Query arguments (optional)"}
            },
            "required": ["query_name"]
        },
        function=query_convex
    ),
    
    Tool(
        name="read_file",
        description="Read a file from the PluginRadar project directory",
        input_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path (relative to project root)"}
            },
            "required": ["path"]
        },
        function=read_file
    ),
    
    Tool(
        name="write_file",
        description="Write content to a file in the project directory",
        input_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path (relative to project root)"},
                "content": {"type": "string", "description": "Content to write"}
            },
            "required": ["path", "content"]
        },
        function=write_file
    ),
    
    Tool(
        name="execute_bash",
        description="Execute a bash command (for running scripts, npm commands, etc.)",
        input_schema={
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Bash command to execute"},
                "timeout": {"type": "integer", "description": "Timeout in seconds", "default": 30}
            },
            "required": ["command"]
        },
        function=execute_bash
    ),
    
    Tool(
        name="save_enrichment",
        description="Save enriched plugin data (features, specs, reviews) to the database",
        input_schema={
            "type": "object",
            "properties": {
                "plugin_slug": {"type": "string", "description": "Plugin slug identifier"},
                "data": {
                    "type": "object",
                    "description": "Enrichment data (features, specs, pros/cons, etc.)"
                }
            },
            "required": ["plugin_slug", "data"]
        },
        function=save_enrichment
    ),
    
    Tool(
        name="save_comparison",
        description="Save a plugin comparison report",
        input_schema={
            "type": "object",
            "properties": {
                "slug": {"type": "string", "description": "Comparison slug (e.g., 'pro-q-4-vs-kirchhoff-eq')"},
                "comparison_data": {
                    "type": "object",
                    "description": "Comparison data with plugins, analysis, verdict, etc."
                }
            },
            "required": ["slug", "comparison_data"]
        },
        function=save_comparison
    ),
]

# =============================================================================
# Agent System Prompts
# =============================================================================

RESEARCH_SYSTEM = """You are a DSP plugin research agent for PluginRadar.

Your job is to research audio plugins (VST, AU, AAX) and gather comprehensive information including:
- Features and specifications
- Pricing and licensing
- User reviews and ratings
- Tutorials and documentation
- Comparisons with competitors

When researching a plugin:
1. Search for official information from the manufacturer
2. Find professional reviews (Sound on Sound, Plugin Boutique, etc.)
3. Look for user opinions and tutorials
4. Extract key features, pros/cons, and use cases
5. Save the enriched data using save_enrichment

Be thorough but efficient. Focus on factual, verifiable information.
Format your final response as a structured summary."""

COMPARISON_SYSTEM = """You are a plugin comparison specialist for PluginRadar.

Your job is to create detailed, fair comparisons between audio plugins. For each comparison:

1. Research both plugins thoroughly
2. Compare key aspects:
   - Sound quality and character
   - Features and flexibility
   - CPU usage and performance
   - Workflow and UI/UX
   - Price and value
3. Identify ideal use cases for each
4. Provide a balanced verdict

Be objective and evidence-based. Acknowledge that different plugins suit different needs.
Always save your comparison using save_comparison with a proper slug."""

TRENDING_SYSTEM = """You are a trends analyst for PluginRadar.

Your job is to identify trending and newsworthy plugins by:
1. Searching for recent plugin releases and updates
2. Finding plugins generating buzz on social media and forums
3. Identifying sales and deals
4. Noting plugins featured in recent tutorials

Focus on the last 30 days. Report plugins that audio producers are actively discussing."""


# =============================================================================
# Agent Factory
# =============================================================================

def create_agent(
    task_type: str = "research",
    verbose: bool = False,
    max_turns: int = 15
) -> Agent:
    """Create an agent configured for a specific task type."""
    
    system_prompts = {
        "research": RESEARCH_SYSTEM,
        "comparison": COMPARISON_SYSTEM,
        "trending": TRENDING_SYSTEM,
    }
    
    logging_hook = PluginRadarLoggingHook(verbose=verbose)
    
    agent = Agent(
        model="claude-sonnet-4-5-20250929",
        system=system_prompts.get(task_type, RESEARCH_SYSTEM),
        tools=TOOLS,
        hooks=[SafetyHook(), logging_hook],
        max_turns=max_turns
    )
    
    # Attach logging hook for summary access
    agent._logging_hook = logging_hook
    
    return agent


# =============================================================================
# Main CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="PluginRadar Research Agent - Research, enrich, and compare DSP plugins",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s "Research FabFilter Pro-Q 4"
  %(prog)s --compare "Pro-Q 4" "Kirchhoff-EQ"
  %(prog)s --enrich fabfilter-pro-q-4
  %(prog)s --trending
  %(prog)s --verbose "What's new in Serum 2?"
        """
    )
    
    parser.add_argument(
        "query",
        nargs="?",
        help="Research query or plugin name"
    )
    
    parser.add_argument(
        "--compare",
        nargs=2,
        metavar=("PLUGIN_A", "PLUGIN_B"),
        help="Compare two plugins"
    )
    
    parser.add_argument(
        "--enrich",
        metavar="SLUG",
        help="Enrich a specific plugin by slug"
    )
    
    parser.add_argument(
        "--trending",
        action="store_true",
        help="Find trending plugins"
    )
    
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Show detailed tool outputs"
    )
    
    parser.add_argument(
        "--max-turns",
        type=int,
        default=15,
        help="Maximum agent turns (default: 15)"
    )
    
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output result as JSON"
    )
    
    args = parser.parse_args()
    
    # Determine task type and query
    if args.compare:
        task_type = "comparison"
        query = f"Compare {args.compare[0]} vs {args.compare[1]} as audio plugins"
    elif args.enrich:
        task_type = "research"
        query = f"Research and enrich the plugin: {args.enrich}. Save the enrichment data."
    elif args.trending:
        task_type = "trending"
        query = "Find trending DSP plugins from the last 30 days. Focus on new releases, updates, and plugins generating buzz."
    elif args.query:
        task_type = "research"
        query = args.query
    else:
        parser.print_help()
        return
    
    # Create and run agent
    print(f"\n🎛️  PluginRadar Agent ({task_type})")
    print(f"📝 Query: {query}")
    print("─" * 60)
    
    agent = create_agent(
        task_type=task_type,
        verbose=args.verbose,
        max_turns=args.max_turns
    )
    
    try:
        result = agent.run(query)
        
        # Show tool summary
        if hasattr(agent, '_logging_hook'):
            agent._logging_hook.summary()
        
        print("\n" + "─" * 60)
        
        if args.json:
            output = {
                "query": query,
                "task_type": task_type,
                "response": result.response,
                "turns": result.turns_completed if hasattr(result, 'turns_completed') else None
            }
            print(json.dumps(output, indent=2))
        else:
            print("\n📋 Result:\n")
            print(result.response)
            
    except Exception as e:
        print(f"\n❌ Agent error: {e}")
        raise


if __name__ == "__main__":
    main()
