import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";

interface Props {
  contentJson: unknown;
  onChange: (contentJson: unknown, contentHtml: string) => void;
}

export default function RichTextEditor({ contentJson, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: (contentJson as object) ?? "",
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON(), editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[300px] focus:outline-none px-4 py-3",
      },
    },
  });

  // Swap in a different article's content when navigating between articles
  // without needing to remount the whole editor instance.
  useEffect(() => {
    if (editor && contentJson) {
      const current = JSON.stringify(editor.getJSON());
      const next = JSON.stringify(contentJson);
      if (current !== next) editor.commands.setContent(contentJson as object);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, contentJson]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-xs font-medium ${active ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 p-2">
        <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()}>
          Bold
        </button>
        <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()}>
          Italic
        </button>
        <button
          type="button"
          className={btn(editor.isActive("heading", { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          className={btn(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          Bullet list
        </button>
        <button
          type="button"
          className={btn(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          Numbered list
        </button>
        <button
          type="button"
          className={btn(editor.isActive("blockquote"))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
        <button
          type="button"
          className={btn(false)}
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
