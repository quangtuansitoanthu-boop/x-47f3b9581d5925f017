<script lang="ts">
  import ProfessionalRichTextEditor from '$lib/components/admin/editor/ProfessionalRichTextEditor.svelte';
  import { createArticleEditorHtml, createArticleImageHtml } from './article-content-editor';

  interface Props {
    content: string;
    imageBusy?: boolean;
    onChange: (value: string) => void;
    uploadImage: (file: File) => Promise<string>;
    onImageBusy: (busy: boolean) => void;
    onError: (message: string) => void;
  }

  let { content, imageBusy = false, onChange, uploadImage, onImageBusy, onError }: Props = $props();
  const editorContent = $derived(createArticleEditorHtml(content));
</script>

<ProfessionalRichTextEditor
  content={editorContent}
  label="Nội dung chi tiết"
  placeholder="Bắt đầu viết nội dung tại đây…"
  variant="article"
  {imageBusy}
  showSplit={false}
  {onChange}
  createImageHtml={createArticleImageHtml}
  {uploadImage}
  {onImageBusy}
  {onError}
/>
