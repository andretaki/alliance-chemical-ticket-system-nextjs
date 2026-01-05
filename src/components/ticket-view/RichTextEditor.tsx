'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Unlink, Trash2 } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
}

const RichTextEditor = ({
  value,
  onChange,
  placeholder = 'Type your reply here...',
  readOnly = false,
  minHeight = '150px'
}: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary text-decoration-underline',
        },
      }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
    },
    editorProps: {
      attributes: {
        class: 'form-control p-3 overflow-auto',
        style: `min-height: ${minHeight}; resize: vertical;`,
      },
    },
  });

  return (
    <div className="rich-text-editor-wrapper">
      <div className="toolbar border border-bottom-0 rounded-top bg-light p-1 d-flex gap-1">
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={`btn btn-sm ${editor?.isActive('bold') ? 'btn-primary' : 'btn-outline-secondary'}`}
          disabled={readOnly}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={`btn btn-sm ${editor?.isActive('italic') ? 'btn-primary' : 'btn-outline-secondary'}`}
          disabled={readOnly}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={`btn btn-sm ${editor?.isActive('bulletList') ? 'btn-primary' : 'btn-outline-secondary'}`}
          disabled={readOnly}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={`btn btn-sm ${editor?.isActive('orderedList') ? 'btn-primary' : 'btn-outline-secondary'}`}
          disabled={readOnly}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const url = window.prompt('URL');
            if (url) {
              editor?.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={`btn btn-sm ${editor?.isActive('link') ? 'btn-primary' : 'btn-outline-secondary'}`}
          disabled={readOnly}
          title="Insert Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor?.chain().focus().unsetLink().run()}
          className="btn btn-sm btn-outline-secondary"
          disabled={!editor?.isActive('link') || readOnly}
          title="Remove Link"
        >
          <Unlink className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor?.commands.clearContent(true)}
          className="btn btn-sm btn-outline-danger ms-auto"
          disabled={readOnly || !editor?.getText().length}
          title="Clear Content"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="border rounded-bottom"
      />
    </div>
  );
};

export default RichTextEditor; 