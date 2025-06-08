'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Type your message here...',
  disabled = false,
  minHeight = '200px'
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Update editor content when value prop changes
  React.useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  return (
    <div className="rich-text-editor">
      <div className="toolbar">
        <button
          onClick={() => editor?.chain().focus().toggleBold().run()}
          className={editor?.isActive('bold') ? 'is-active' : ''}
          type="button"
        >
          Bold
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          className={editor?.isActive('italic') ? 'is-active' : ''}
          type="button"
        >
          Italic
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          className={editor?.isActive('underline') ? 'is-active' : ''}
          type="button"
        >
          Underline
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          className={editor?.isActive('strike') ? 'is-active' : ''}
          type="button"
        >
          Strike
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          className={editor?.isActive('bulletList') ? 'is-active' : ''}
          type="button"
        >
          Bullet List
        </button>
        <button
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          className={editor?.isActive('orderedList') ? 'is-active' : ''}
          type="button"
        >
          Numbered List
        </button>
        <button
          onClick={() => {
            const url = window.prompt('Enter URL');
            if (url) {
              editor?.chain().focus().setLink({ href: url }).run();
            }
          }}
          className={editor?.isActive('link') ? 'is-active' : ''}
          type="button"
        >
          Link
        </button>
      </div>
      <EditorContent editor={editor} />
      <style jsx global>{`
        .rich-text-editor {
          border: 1px solid #dee2e6;
          border-radius: 0.375rem;
          background-color: #fff !important;
        }
        .rich-text-editor .toolbar {
          padding: 0.5rem;
          border-bottom: 1px solid #dee2e6;
          background-color: #f8f9fa;
          border-top-left-radius: 0.375rem;
          border-top-right-radius: 0.375rem;
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .rich-text-editor .toolbar button {
          padding: 0.25rem 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 0.25rem;
          background-color: #fff;
          color: #212529;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .rich-text-editor .toolbar button:hover {
          background-color: #e9ecef;
        }
        .rich-text-editor .toolbar button.is-active {
          background-color: #0d6efd;
          color: #fff;
          border-color: #0d6efd;
        }
        .rich-text-editor .ProseMirror {
          padding: 1rem;
          min-height: ${minHeight};
          outline: none;
          background-color: #fff !important;
        }
        .rich-text-editor .ProseMirror p {
          margin: 0;
        }
        .rich-text-editor .ProseMirror ul,
        .rich-text-editor .ProseMirror ol {
          padding-left: 1.5rem;
        }
        .rich-text-editor .ProseMirror a {
          color: #0d6efd;
          text-decoration: none;
        }
        .rich-text-editor .ProseMirror a:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
} 