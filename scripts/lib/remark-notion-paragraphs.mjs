// Notion exports separate text blocks on consecutive lines, and uses <br>
// for line breaks within a block. Apply this only to generated Notion posts.
export default function remarkNotionParagraphs() {
  return (tree) => {
    const generated = tree.children.some(
      (node) => node.type === 'html' && node.value.trim() === '<!-- notion-sync: generated -->',
    );
    if (!generated) return;

    tree.children = tree.children.flatMap((node) => {
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
