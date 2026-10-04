// Notion exports separate text blocks on consecutive lines, and uses <br>
// for line breaks within a block. Apply this only to generated Notion posts.
export default function remarkNotionParagraphs() {
  const processor = this;
  return (tree, file) => {
    const generated = tree.children.some(
      (node) => node.type === 'html' && node.value.trim() === '<!-- notion-sync: generated -->',
    );
    if (!generated) return;

    function parseTableCells(value) {
      const nodes = [];
      const cellPattern = /(<(td|th)\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/\2\s*>)/gi;
      let cursor = 0;

      for (const match of value.matchAll(cellPattern)) {
        const content = match[3];
        const children = processor.parse(content).children.flatMap(
          (node) => node.type === 'paragraph' ? node.children : [node],
        );
        if (children.length === 0 || (children.length === 1 && children[0].type === 'text' && children[0].value === content)) continue;

        // Keep the table/cell tags and attributes as HTML, but let the normal
        // Markdown pipeline render links, emphasis and code inside each cell.
        const start = match.index + match[1].length;
        nodes.push({ type: 'html', value: value.slice(cursor, start) }, ...children);
        cursor = start + content.length;
      }

      nodes.push({ type: 'html', value: value.slice(cursor) });
      return nodes;
    }

    // HTML tables consume following Markdown until a blank line in CommonMark.
    // Parse the cell contents and swallowed tail without changing table structure.
    function repairBlocks(nodes, source, reparseBlocks = true) {
      const repaired = [];
      for (const node of nodes) {
        if (node.type === 'heading' && node.depth === 2 && node.position) {
          const raw = source.slice(node.position.start.offset, node.position.end.offset);
          const lastLine = raw.split(/\r?\n/).at(-1);
          // Notion headings use # markers. A paragraph followed by a divider
          // can instead be parsed as a setext heading; restore both blocks.
          // Source lines inside blockquotes may retain their > prefixes.
          if (/^[ \t>]*-{3,}[ \t]*$/.test(lastLine)) {
            repaired.push(
              { type: 'paragraph', children: node.children },
              { type: 'thematicBreak' },
            );
            continue;
          }
        }
        if (reparseBlocks && node.type === 'html' && node.position && /^\s*<table[\s>]/i.test(node.value)) {
          const raw = source.slice(node.position.start.offset, node.position.end.offset);
          const end = /<\/table>[ \t]*(?:\r?\n|$)/i.exec(raw);
          if (end) {
            const boundary = end.index + end[0].length;
            // A blank line inside code can end the original HTML node before
            // the closing fence. Reparse the entire remaining source together
            // and replace its old siblings so that code stays in one block.
            const tail = source.slice(node.position.start.offset + boundary);
            return [
              ...repaired,
              ...parseTableCells(raw.slice(0, boundary).trimEnd()),
              ...repairBlocks(processor.parse(tail).children, tail),
            ];
          }
        }
        if (reparseBlocks && node.type === 'list' && node.position) {
          const raw = source.slice(node.position.start.offset, node.position.end.offset);
          // In Notion, child blocks are indented. Unindented prose after a
          // list is a new block, not CommonMark's lazy list continuation.
          const separated = raw.replace(/\n(?=\S)(?![-+*] |\d+[.)] )/g, '\n\n');
          if (separated !== raw) {
            repaired.push(...repairBlocks(processor.parse(separated).children, separated));
            continue;
          }
        }
        if (['blockquote', 'list', 'listItem'].includes(node.type)) {
          // Nested source slices retain outer quote/list prefixes. Only repair
          // dividers here; reparsing those slices would change the nesting.
          repaired.push({ ...node, children: repairBlocks(node.children, source, false) });
          continue;
        }
        repaired.push(node);
      }
      return repaired;
    }

    tree.children = repairBlocks(tree.children, String(file)).flatMap((node) => {
      if (node.type !== 'paragraph') return [node];
      return splitChildren(node.children).map((children) => ({ type: 'paragraph', children }));
    });
  };
}

function splitChildren(children) {
  const groups = [[]];
  for (const child of children) {
    let parts;
    if (child.type === 'text') {
      parts = child.value.split(/\r?\n/).map((value) => ({ ...child, value }));
    } else if (['strong', 'emphasis', 'delete', 'link'].includes(child.type)) {
      parts = splitChildren(child.children).map((nested) => ({ ...child, children: nested }));
    } else {
      parts = [child];
    }
    parts.forEach((part, index) => {
      if (index > 0) groups.push([]);
      if (part.type !== 'text' || part.value) groups.at(-1).push(part);
    });
  }
  return groups.filter((group) => group.length > 0);
}
