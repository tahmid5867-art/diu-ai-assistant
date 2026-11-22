import React from 'react';

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Match markdown links [label](url) or **bold**
  const tokenRegex = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-[#111827]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (m) {
        parts.push(
          <a
            key={`a-${keyIdx++}`}
            href={m[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#065F46] underline decoration-[#065F46]/40 underline-offset-2 hover:text-[#064E3B]"
          >
            {m[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export function FormattedMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; text: string }[] = [];
  let listKey = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    const ListTag = isOrdered ? 'ol' : 'ul';
    blocks.push(
      <ListTag
        key={`list-${listKey++}`}
        className={`my-2 space-y-1.5 pl-5 ${isOrdered ? 'list-decimal' : 'list-disc'} text-[14.5px] leading-relaxed text-[#1F2937]`}
      >
        {listItems.map((item, idx) => (
          <li key={idx}>{renderInline(item.text)}</li>
        ))}
      </ListTag>
    );
    listItems = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      return;
    }

    const bulletMatch = /^[-*•]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) flushList();
      listItems.push({ ordered: false, text: bulletMatch[1] });
      return;
    }

    const orderedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) flushList();
      listItems.push({ ordered: true, text: orderedMatch[1] });
      return;
    }

    flushList();

    if (line.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${idx}`} className="mt-3 mb-1 font-display text-[15px] font-semibold text-[#064E3B]">
          {renderInline(line.slice(4))}
        </h4>
      );
      return;
    }

    if (line.startsWith('## ')) {
      blocks.push(
        <h3 key={`h3-${idx}`} className="mt-3 mb-1.5 font-display text-[16px] font-semibold text-[#064E3B]">
          {renderInline(line.slice(3))}
        </h3>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="my-1.5 text-[14.5px] leading-relaxed text-[#1F2937]">
        {renderInline(line)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-0.5">{blocks}</div>;
}
