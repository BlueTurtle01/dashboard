"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getTicketMessages,
  addTicketMessage,
  TicketMessage,
} from "@/lib/actions/support";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];

type Props = {
  ticketId: string;
  currentUserId: string;
  isAdmin: boolean;
  ticketClosed?: boolean;
};

export default function TicketThread({ ticketId, currentUserId, isAdmin, ticketClosed }: Props) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    getTicketMessages(ticketId).then((msgs) => {
      if (!cancelled) {
        setMessages(msgs);
        setLoading(false);
        resolveAttachmentUrls(msgs);
      }
    });
    return () => { cancelled = true; };
  }, [ticketId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function resolveAttachmentUrls(msgs: TicketMessage[]) {
    const supabase = createClient();
    const withAttachments = msgs.filter((m) => m.attachment_path);
    if (withAttachments.length === 0) return;

    const urlMap: Record<string, string> = {};
    await Promise.all(
      withAttachments.map(async (m) => {
        const { data } = await supabase.storage
          .from("support-attachments")
          .createSignedUrl(m.attachment_path!, 3600);
        if (data?.signedUrl) urlMap[m.id] = data.signedUrl;
      })
    );
    setAttachmentUrls((prev) => ({ ...prev, ...urlMap }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFileError(null);
    if (!selected) { setFile(null); return; }
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setFileError("Only image files are allowed (JPEG, PNG, GIF, WebP).");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFileError("File must be under 5 MB.");
      setFile(null);
      e.target.value = "";
      return;
    }
    setFile(selected);
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setSending(true);
    setSendError(null);

    let attachmentPath: string | undefined;
    let attachmentName: string | undefined;

    if (file) {
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const safeName = `${crypto.randomUUID()}.${ext}`;
      const storagePath = `${ticketId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("support-attachments")
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (uploadError) {
        setSendError(`Upload failed: ${uploadError.message}`);
        setSending(false);
        return;
      }

      attachmentPath = storagePath;
      attachmentName = file.name;
    }

    const result = await addTicketMessage({
      ticketId,
      message: text.trim() || "(attachment)",
      attachmentPath,
      attachmentName,
    });

    if (result.error) {
      setSendError(result.error);
      setSending(false);
      return;
    }

    // Optimistically refresh
    const updated = await getTicketMessages(ticketId);
    setMessages(updated);
    await resolveAttachmentUrls(updated.filter((m) => !attachmentUrls[m.id]));

    setText("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setSending(false);
  }

  const disabled = ticketClosed && !isAdmin;

  if (loading) {
    return <p style={loadingStyle}>Loading messages...</p>;
  }

  return (
    <div style={threadWrapStyle}>
      <div style={sectionDivider} />
      <p style={threadLabelStyle}>Conversation</p>

      {/* Message list */}
      <div style={messageListStyle}>
        {messages.length === 0 && (
          <p style={emptyMsgStyle}>No messages yet. Start the conversation below.</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.user_id === currentUserId;
          const signedUrl = attachmentUrls[msg.id];
          return (
            <div
              key={msg.id}
              style={{ ...msgRowStyle, justifyContent: isMine ? "flex-end" : "flex-start" }}
            >
              <div
                style={{
                  ...bubbleStyle,
                  background: isMine ? "#111" : "#f3f4f6",
                  color: isMine ? "#fff" : "#111",
                  borderBottomRightRadius: isMine ? "4px" : "16px",
                  borderBottomLeftRadius: isMine ? "16px" : "4px",
                }}
              >
                <div style={{ ...metaLineStyle, color: isMine ? "#ccc" : "#888" }}>
                  <span style={senderStyle}>
                    {msg.is_admin ? "Support Team" : msg.user_email}
                  </span>
                  <span>{new Date(msg.created_at).toLocaleString()}</span>
                </div>
                {msg.message !== "(attachment)" && (
                  <p style={msgTextStyle}>{msg.message}</p>
                )}
                {msg.attachment_name && (
                  <div style={attachmentRowStyle}>
                    {signedUrl ? (
                      <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                        <img
                          src={signedUrl}
                          alt={msg.attachment_name}
                          style={attachmentImgStyle}
                        />
                      </a>
                    ) : (
                      <span style={{ ...attachmentNameStyle, color: isMine ? "#ddd" : "#555" }}>
                        {msg.attachment_name}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {disabled ? (
        <p style={closedNoteStyle}>This ticket is closed. No further replies can be sent.</p>
      ) : (
        <form onSubmit={handleSend} style={composerStyle}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a message..."
            style={composerTextareaStyle}
            rows={3}
            disabled={sending}
          />
          <div style={composerFooterStyle}>
            <div style={composerActionsLeft}>
              <label style={attachLabelStyle}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                  disabled={sending}
                />
                <span style={attachBtnStyle}>+ Attach image</span>
              </label>
              {file && (
                <span style={fileNameStyle}>
                  {file.name}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    style={removeFileBtn}
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={sending || (!text.trim() && !file)}
              style={{
                ...sendBtnStyle,
                opacity: sending || (!text.trim() && !file) ? 0.5 : 1,
              }}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
          {fileError && <p style={fileErrorStyle}>{fileError}</p>}
          {sendError && <p style={fileErrorStyle}>{sendError}</p>}
        </form>
      )}
    </div>
  );
}

const threadWrapStyle: React.CSSProperties = {
  marginTop: "8px",
};

const sectionDivider: React.CSSProperties = {
  height: "1px",
  background: "#f0f0f0",
  margin: "16px 0 12px",
};

const threadLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#aaa",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  margin: "0 0 10px",
};

const messageListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxHeight: "360px",
  overflowY: "auto",
  padding: "4px 0",
};

const emptyMsgStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: "13px",
  textAlign: "center",
  margin: "16px 0",
};

const msgRowStyle: React.CSSProperties = {
  display: "flex",
};

const bubbleStyle: React.CSSProperties = {
  maxWidth: "78%",
  padding: "10px 14px",
  borderRadius: "16px",
  fontSize: "14px",
};

const metaLineStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: "11px",
  marginBottom: "5px",
  gap: "12px",
};

const senderStyle: React.CSSProperties = {
  fontWeight: 600,
};

const msgTextStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const attachmentRowStyle: React.CSSProperties = {
  marginTop: "8px",
};

const attachmentImgStyle: React.CSSProperties = {
  maxWidth: "200px",
  maxHeight: "200px",
  borderRadius: "8px",
  display: "block",
  cursor: "pointer",
  objectFit: "contain",
};

const attachmentNameStyle: React.CSSProperties = {
  fontSize: "12px",
};

const closedNoteStyle: React.CSSProperties = {
  color: "#888",
  fontSize: "13px",
  padding: "10px 0",
  fontStyle: "italic",
};

const composerStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const composerTextareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: "8px",
  fontSize: "14px",
  resize: "vertical",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const composerFooterStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
};

const composerActionsLeft: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexWrap: "wrap",
};

const attachLabelStyle: React.CSSProperties = {
  cursor: "pointer",
};

const attachBtnStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#555",
  padding: "6px 12px",
  border: "1px solid #ddd",
  borderRadius: "6px",
  userSelect: "none",
};

const fileNameStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#555",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const removeFileBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "#888",
  fontSize: "12px",
  padding: "0 2px",
};

const sendBtnStyle: React.CSSProperties = {
  padding: "8px 22px",
  border: "none",
  borderRadius: "8px",
  background: "#111",
  color: "#fff",
  fontWeight: 700,
  fontSize: "14px",
  cursor: "pointer",
};

const fileErrorStyle: React.CSSProperties = {
  color: "#b00020",
  fontSize: "12px",
  margin: 0,
};

const loadingStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: "13px",
  padding: "12px 0",
};
