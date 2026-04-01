import { useCallback, useEffect, useState } from 'react';
import { type AttachmentStatus, type ComposerAttachmentItem } from '@/components/llm/LlmChatComposer';
import { useDataStore } from '@/stores/dataStore';
import { useNlSuggestionStore } from '@/stores/nlSuggestionStore';
import { ingestProjectFile } from '../projectFileIngestion';

export const CONTEXT_ATTACHMENT_ACCEPT =
  '.pdf,.docx,.md,.markdown,.txt,.log,.json,.csv,.xlsx,.html,.htm,.xml,.yml,.yaml,.rtf';

type PendingAttachmentStatus = 'queued' | 'uploading' | 'success' | 'error';

export interface PendingAttachment {
  id: string;
  file: File;
  name: string;
  size: number;
  status: PendingAttachmentStatus;
  errorMessage?: string;
}

export interface UploadedAttachmentPreview {
  name: string;
  kind: 'dataset' | 'document';
  fileType?: string;
  size: number;
  nRows?: number;
  nCols?: number;
  chunkCount?: number;
  sample?: Record<string, unknown>[];
}

interface UseAttachmentUploaderProps {
  projectId: string;
}

interface UseAttachmentUploaderReturn {
  pendingAttachments: PendingAttachment[];
  attachmentStatus: AttachmentStatus;
  attachmentMessage: string | null;
  composerAttachmentItems: ComposerAttachmentItem[];
  uploadPendingAttachments: (targetIds?: string[]) => Promise<{ uploaded: UploadedAttachmentPreview[]; failedCount: number }>;
  handleAttachFile: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveAttachment: (attachmentId: string) => void;
  handleRetryAttachment: (attachmentId: string) => void;
}

export function useAttachmentUploader({ projectId }: UseAttachmentUploaderProps): UseAttachmentUploaderReturn {
  const addFile = useDataStore((state) => state.addFile);
  const addPreview = useDataStore((state) => state.addPreview);
  const setFileMetadata = useDataStore((state) => state.setFileMetadata);
  const hydrateFromBackend = useDataStore((state) => state.hydrateFromBackend);
  const fetchProjectSuggestions = useNlSuggestionStore((state) => state.fetchProjectSuggestions);

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentFeedback, setAttachmentFeedback] = useState<{ status: AttachmentStatus; message: string } | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState<AttachmentStatus>('idle');
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);

  const composerAttachmentItems: ComposerAttachmentItem[] = pendingAttachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    status: attachment.status,
    message: attachment.errorMessage ?? null
  }));

  useEffect(() => {
    const uploadingCount = pendingAttachments.filter((attachment) => attachment.status === 'uploading').length;
    const erroredCount = pendingAttachments.filter((attachment) => attachment.status === 'error').length;

    if (uploadingCount > 0) {
      setAttachmentStatus('uploading');
      setAttachmentMessage(`Uploading ${uploadingCount} attachment${uploadingCount === 1 ? '' : 's'}...`);
      return;
    }

    if (erroredCount > 0) {
      setAttachmentStatus('error');
      setAttachmentMessage(`${erroredCount} attachment${erroredCount === 1 ? '' : 's'} failed. Retry or remove.`);
      return;
    }

    if (pendingAttachments.length > 0) {
      setAttachmentStatus('queued');
      setAttachmentMessage(`${pendingAttachments.length} attachment${pendingAttachments.length === 1 ? '' : 's'} ready to send.`);
      return;
    }

    if (attachmentFeedback) {
      setAttachmentStatus(attachmentFeedback.status);
      setAttachmentMessage(attachmentFeedback.message);
      return;
    }

    setAttachmentStatus('idle');
    setAttachmentMessage(null);
  }, [pendingAttachments, attachmentFeedback]);

  useEffect(() => {
    if (!attachmentFeedback) {
      return;
    }

    const timeout = setTimeout(() => {
      setAttachmentFeedback(null);
    }, 3500);

    return () => clearTimeout(timeout);
  }, [attachmentFeedback]);

  const uploadPendingAttachments = useCallback(
    async (targetIds?: string[]) => {
      if (!projectId) {
        return { uploaded: [] as UploadedAttachmentPreview[], failedCount: 0 };
      }

      const targetIdSet = targetIds ? new Set(targetIds) : null;
      const queue = pendingAttachments.filter((attachment) => {
        const isRetryable = attachment.status === 'queued' || attachment.status === 'error';
        return isRetryable && (!targetIdSet || targetIdSet.has(attachment.id));
      });

      if (queue.length === 0) {
        return { uploaded: [] as UploadedAttachmentPreview[], failedCount: 0 };
      }

      setAttachmentFeedback(null);

      const uploaded: UploadedAttachmentPreview[] = [];
      let failedCount = 0;

      for (const attachment of queue) {
        setPendingAttachments((prev) =>
          prev.map((item) =>
            item.id === attachment.id ? { ...item, status: 'uploading', errorMessage: undefined } : item
          )
        );

        try {
          const { summary } = await ingestProjectFile({
            projectId,
            file: attachment.file,
            addFileWhen: 'after-upload',
            addFile,
            addPreview,
            setFileMetadata,
            hydrateFromBackend,
            refreshProjectSuggestions: fetchProjectSuggestions,
          });
          uploaded.push({
            name: attachment.name,
            ...summary,
          });

          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id ? { ...item, status: 'success', errorMessage: undefined } : item
            )
          );
        } catch (error) {
          failedCount += 1;
          const errorMessage = error instanceof Error
            ? error.message
            : `Failed to upload ${attachment.name}. Please try again.`;

          setPendingAttachments((prev) =>
            prev.map((item) =>
              item.id === attachment.id ? { ...item, status: 'error', errorMessage } : item
            )
          );
        }
      }

      setPendingAttachments((prev) => prev.filter((item) => item.status !== 'success'));

      if (failedCount > 0) {
        setAttachmentFeedback({
          status: 'error',
          message: `${failedCount} attachment${failedCount === 1 ? '' : 's'} failed. Retry or remove before continuing.`
        });
      } else if (uploaded.length > 0) {
        setAttachmentFeedback({
          status: 'success',
          message: `Added ${uploaded.length} attachment${uploaded.length === 1 ? '' : 's'} to context.`
        });
      }

      return { uploaded, failedCount };
    },
    [pendingAttachments, projectId, addFile, addPreview, setFileMetadata, hydrateFromBackend, fetchProjectSuggestions]
  );

  const handleAttachFile = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) {
      event.target.value = '';
      return;
    }

    const pendingAttachment: PendingAttachment = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
    };

    setAttachmentFeedback(null);
    setPendingAttachments((prev) => [...prev, pendingAttachment]);
    event.target.value = '';
  }, [projectId]);

  const handleRemoveAttachment = useCallback((attachmentId: string) => {
    setAttachmentFeedback(null);
    setPendingAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
  }, []);

  const handleRetryAttachment = useCallback((attachmentId: string) => {
    void uploadPendingAttachments([attachmentId]);
  }, [uploadPendingAttachments]);

  return {
    pendingAttachments,
    attachmentStatus,
    attachmentMessage,
    composerAttachmentItems,
    uploadPendingAttachments,
    handleAttachFile,
    handleRemoveAttachment,
    handleRetryAttachment,
  };
}
