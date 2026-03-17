"""
Jedi Intelligence Script

Reads a JSON request from stdin and dispatches to the appropriate Jedi
operation (complete, hover, signatures, diagnostics). Always outputs
valid JSON to stdout.
"""

import json
import sys

# Make jedi available from the container-local install path
sys.path.insert(0, '/workspace/.python')


def handle_complete(script, line, column):
    """Return up to 50 code completions."""
    completions = script.complete(line, column)
    results = []
    for c in completions[:50]:
        comp = {
            "name": c.name,
            "type": c.type or "statement",
        }
        if c.module_name:
            comp["module"] = c.module_name
        try:
            sigs = c.get_signatures()
            if sigs:
                comp["signature"] = str(sigs[0])
        except Exception:
            pass
        try:
            doc = c.docstring()
            if doc:
                comp["docstring"] = doc[:200]
        except Exception:
            pass
        results.append(comp)
    return {"completions": results}


def handle_hover(script, line, column):
    """Return type/docstring information for the symbol under the cursor."""
    # infer() resolves the actual type (str, DataFrame, function, module, etc.).
    # goto() is a fallback for cases infer cannot handle.
    names = script.infer(line, column)
    if not names:
        names = script.goto(line, column, follow_imports=True)
    if not names:
        return {"hover": None}

    d = names[0]
    hover = {
        "name": d.name,
        "type": d.type or "unknown",
        "docstring": (d.docstring() or "")[:1000],
    }
    if d.full_name:
        hover["fullName"] = d.full_name
    return {"hover": hover}


def handle_signatures(script, line, column):
    """Return call-signature help for the function at the cursor."""
    sigs = script.get_signatures(line, column)
    results = []
    for sig in sigs:
        params = []
        for p in sig.params:
            param = {"name": p.name, "description": p.description}
            if p.default is not None:
                param["default"] = str(p.default)
            params.append(param)
        results.append({
            "name": sig.name,
            "docstring": (sig.docstring() or "")[:500],
            "params": params,
            "activeParam": sig.index if sig.index is not None else 0,
        })
    return {"signatures": results}


def handle_diagnostics(code, current_cell_offset):
    """Compile only the current cell's code and report syntax errors."""
    lines = code.split('\n')
    # Lines before current_cell_offset belong to previous cells
    cell_lines = lines[current_cell_offset:]
    cell_code = '\n'.join(cell_lines)

    diagnostics = []
    try:
        compile(cell_code, "<cell>", "exec")
    except SyntaxError as e:
        line_no = e.lineno or 1
        col = (e.offset or 1) - 1  # Python offset is 1-based
        end_col = col + 1
        # Try to get end_lineno / end_offset (Python 3.10+)
        end_line = getattr(e, 'end_lineno', None) or line_no
        end_offset = getattr(e, 'end_offset', None)
        if end_offset is not None:
            end_col = end_offset - 1
        diagnostics.append({
            "line": line_no,
            "column": col,
            "endLine": end_line,
            "endColumn": end_col,
            "message": e.msg,
            "severity": "error",
        })
    return {"diagnostics": diagnostics}


def main():
    try:
        request = json.loads(sys.stdin.read())
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse input: {str(e)}"}))
        return

    operation = request.get("operation")
    code = request.get("code", "")
    line = request.get("line", 1)
    column = request.get("column", 0)
    current_cell_offset = request.get("currentCellOffset", 0)

    try:
        if operation == "diagnostics":
            result = handle_diagnostics(code, current_cell_offset)
        else:
            import jedi
            script = jedi.Script(code)
            if operation == "complete":
                result = handle_complete(script, line, column)
            elif operation == "hover":
                result = handle_hover(script, line, column)
            elif operation == "signatures":
                result = handle_signatures(script, line, column)
            else:
                result = {"error": f"Unknown operation: {operation}"}
        print(json.dumps(result))
    except Exception as e:
        # Always output valid JSON, even on unexpected errors
        fallback = {}
        if operation == "complete":
            fallback = {"completions": []}
        elif operation == "hover":
            fallback = {"hover": None}
        elif operation == "signatures":
            fallback = {"signatures": []}
        elif operation == "diagnostics":
            fallback = {"diagnostics": []}
        else:
            fallback = {"error": str(e)}
        print(json.dumps(fallback))


if __name__ == "__main__":
    main()
