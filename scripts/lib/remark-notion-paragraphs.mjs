// Notion exports separate text blocks on consecutive lines, and uses <br>
// for line breaks within a block. Apply this only to generated Notion posts.
export default function remarkNotionParagraphs() {
  const processor = this;
  return (tree, file) => {
    const generated = tree.children.some(
      (node) => node.type === 'html' && node.value.trim() === '<!-- notion-sync: generated -->',
    );
    if (!generated) return;

    // HTML tables consume following Markdown until a blank line in CommonMark.
    // Reparse only the swallowed tail; leave table cells and code untouched.
    function repairBlocks(nodes, source) {
      return nodes.flatMap((node) => {
        if (node.type === 'html' && /^\s*<table[\s>]/i.test(node.value)) {
          const end = /<\/table>[ \t]*(?:\r?\n|$)/i.exec(node.value);
          if (end) {
            const boundary = end.index + end[0].length;
            const tail = node.value.slice(boundary);
            if (tail.trim()) {
              return [
                { ...node, value: node.value.slice(0, boundary).trimEnd() },
                ...repairBlocks(processor.parse(tail).children, tail),
              ];
            }
          }
        }
        if (node.type === 'list' && node.position) {
          const raw = source.slice(node.position.start.offset, node.position.end.offset);
          // In Notion, child blocks are indented. Unindented prose after a
          // list is a new block, not CommonMark's lazy list continuation.
          const separated = raw.replace(/\n(?=\S)(?![-+*] |\d+[.)] )/g, '\n\n');
          if (separated !== raw) return processor.parse(separated).children;
        }
        return [node];
      });
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
