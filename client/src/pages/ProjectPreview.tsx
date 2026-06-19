import AppLayout from "@/components/AppLayout";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Code2,
  Download,
  Edit3,
  Eye,
  Loader2,
  MessageSquare,
  Monitor,
  Paperclip,
  Save,
  Smartphone,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

type ViewMode = "preview" | "code";
type DeviceMode = "desktop" | "mobile";
type PendingImage = { dataUrl: string; mimeType: string; fileName: string };

const MAX_ATTACHED_IMAGE_BYTES = 6 * 1024 * 1024;

export default function ProjectPreview() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0", 10);

  const { data, isLoading } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId }
  );

  const updateHtmlMutation = trpc.projects.updateHtml.useMutation({
    onSuccess: () => toast.success("Änderungen gespeichert"),
    onError: err => toast.error(err.message),
  });

  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [deviceMode, setDeviceMode] = useState<DeviceMode>("desktop");
  const [editMode, setEditMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [hasChanges, setHasChanges] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const originalHtmlRef = useRef<string>("");

  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reviseMutation = trpc.projects.reviseViaChat.useMutation({
    onSuccess: result => {
      setChatMessages(prev => [
        ...prev,
        { role: "assistant", content: result.reply },
      ]);
      setHtmlContent(result.htmlContent);
      setHasChanges(false);
      setPendingImage(null);
    },
    onError: err => {
      setChatMessages(prev => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Das hat nicht funktioniert: ${err.message}`,
        },
      ]);
      toast.error(err.message);
    },
  });

  const handleSendChatMessage = (content: string) => {
    setChatMessages(prev => [...prev, { role: "user", content }]);
    reviseMutation.mutate({
      projectId,
      message: content,
      attachedImage: pendingImage
        ? { dataUrl: pendingImage.dataUrl, mimeType: pendingImage.mimeType }
        : null,
    });
  };

  const handleAttachImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte nur Bilddateien hochladen.");
      return;
    }
    if (file.size > MAX_ATTACHED_IMAGE_BYTES) {
      toast.error("Das Bild ist zu groß (max. 6 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage({
        dataUrl: String(reader.result),
        mimeType: file.type,
        fileName: file.name,
      });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (data?.website?.htmlContent) {
      setHtmlContent(data.website.htmlContent);
      originalHtmlRef.current = data.website.htmlContent;
    }
  }, [data?.website?.htmlContent]);

  // Inject contenteditable into iframe when edit mode is toggled
  const applyEditMode = useCallback((enabled: boolean) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    const selectors =
      "h1, h2, h3, h4, h5, h6, p, span, li, button, a, label, td, th";
    const elements = doc.querySelectorAll<HTMLElement>(selectors);

    elements.forEach(el => {
      if (enabled) {
        el.setAttribute("contenteditable", "true");
        el.style.outline = "1px dashed rgba(200,169,110,0.5)";
        el.style.borderRadius = "2px";
        el.style.cursor = "text";
      } else {
        el.removeAttribute("contenteditable");
        el.style.outline = "";
        el.style.borderRadius = "";
        el.style.cursor = "";
      }
    });
  }, []);

  const handleIframeLoad = useCallback(() => {
    if (editMode) applyEditMode(true);
  }, [editMode, applyEditMode]);

  const toggleEditMode = () => {
    const newMode = !editMode;
    setEditMode(newMode);
    applyEditMode(newMode);
  };

  const extractHtmlFromIframe = (): string => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return htmlContent;
    // Remove contenteditable attributes before saving
    const doc = iframe.contentDocument;
    const cloned = doc.documentElement.cloneNode(true) as HTMLElement;
    cloned.querySelectorAll("[contenteditable]").forEach(el => {
      (el as HTMLElement).removeAttribute("contenteditable");
      (el as HTMLElement).style.outline = "";
      (el as HTMLElement).style.borderRadius = "";
      (el as HTMLElement).style.cursor = "";
    });
    return `<!DOCTYPE html>\n<html${cloned.outerHTML.slice(5)}`;
  };

  const handleSave = () => {
    const newHtml = extractHtmlFromIframe();
    setHtmlContent(newHtml);
    setHasChanges(true);
    updateHtmlMutation.mutate({ projectId, htmlContent: newHtml });
  };

  const handleExport = () => {
    const html = extractHtmlFromIframe();
    // Create a ZIP-like download (single HTML file for simplicity)
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data?.project.name ?? "website"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Website als HTML heruntergeladen");
  };

  if (isLoading) {
    return (
      <AppLayout title="Vorschau laden…">
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!data?.website) {
    return (
      <AppLayout title="Keine Website gefunden">
        <div className="text-center py-24">
          <AlertCircle
            size={40}
            className="mx-auto mb-4 text-muted-foreground opacity-30"
          />
          <p className="text-muted-foreground mb-4">
            Für dieses Projekt wurde noch keine Website generiert.
          </p>
          <Link href={`/project/${projectId}`}>
            <Button variant="outline">
              <ArrowLeft size={14} className="mr-1.5" /> Zurück zum Projekt
            </Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-border/60 bg-card shrink-0 gap-3">
        {/* Left */}
        <div className="flex items-center gap-2 min-w-0">
          <Link href={`/project/${projectId}`}>
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-muted-foreground"
            >
              <ArrowLeft size={15} />
            </Button>
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">
              {data.project.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Website-Vorschau
            </p>
          </div>
        </div>

        {/* Center: View/Device Toggles */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-secondary rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("preview")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "preview"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye size={12} /> Vorschau
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewMode === "code"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code2 size={12} /> HTML
            </button>
          </div>

          {viewMode === "preview" && (
            <div className="flex items-center bg-secondary rounded-lg p-0.5">
              <button
                onClick={() => setDeviceMode("desktop")}
                className={`p-1.5 rounded-md transition-all ${
                  deviceMode === "desktop"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Desktop"
              >
                <Monitor size={13} />
              </button>
              <button
                onClick={() => setDeviceMode("mobile")}
                className={`p-1.5 rounded-md transition-all ${
                  deviceMode === "mobile"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Mobile"
              >
                <Smartphone size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {viewMode === "preview" && (
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              className={`text-xs ${editMode ? "bg-amber-500 text-white hover:bg-amber-600 border-amber-500" : ""}`}
              onClick={toggleEditMode}
            >
              {editMode ? (
                <>
                  <Check size={12} className="mr-1" /> Bearbeitung aktiv
                </>
              ) : (
                <>
                  <Edit3 size={12} className="mr-1" /> Bearbeiten
                </>
              )}
            </Button>
          )}

          <Button
            size="sm"
            variant={chatOpen ? "default" : "outline"}
            className={`text-xs ${chatOpen ? "bg-primary text-primary-foreground" : ""}`}
            onClick={() => setChatOpen(v => !v)}
          >
            <MessageSquare size={12} className="mr-1" /> Per Chat ändern
          </Button>

          {editMode && (
            <Button
              size="sm"
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleSave}
              disabled={updateHtmlMutation.isPending}
            >
              {updateHtmlMutation.isPending ? (
                <Loader2 size={12} className="mr-1 animate-spin" />
              ) : (
                <Save size={12} className="mr-1" />
              )}
              Speichern
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={handleExport}
          >
            <Download size={12} className="mr-1" /> Export
          </Button>
        </div>
      </header>

      {/* ── Edit Mode Banner ──────────────────────────────────────────────── */}
      {editMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-xs text-amber-700 shrink-0">
          <Edit3 size={12} />
          <span>
            <strong>Bearbeitungsmodus aktiv</strong> – Klicke auf beliebige
            Texte, um sie direkt zu bearbeiten. Klicke „Speichern", um
            Änderungen zu übernehmen.
          </span>
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden bg-secondary/30 flex">
        <div className="flex-1 min-w-0 overflow-hidden">
          {viewMode === "preview" ? (
            <div
              className={`h-full flex items-start justify-center transition-all duration-300 ${
                deviceMode === "mobile" ? "py-6" : ""
              }`}
            >
              <iframe
                ref={iframeRef}
                srcDoc={htmlContent}
                onLoad={handleIframeLoad}
                className={`bg-white transition-all duration-300 ${
                  deviceMode === "mobile"
                    ? "w-[390px] h-[844px] rounded-2xl shadow-xl border border-border/30"
                    : "w-full h-full border-0"
                }`}
                title="Website-Vorschau"
                // allow-same-origin (needed so the parent can read/write
                // contentDocument for inline editing) and allow-scripts must
                // never be combined: together they'd let an inline <script> in
                // LLM-generated HTML — itself influenced by scraped competitor
                // text and later chat prompts — escape into this app's own
                // origin (cookies, session, authenticated tRPC calls). Dropping
                // allow-scripts means embedded <script> tags simply don't run
                // here; they still work once the user exports/deploys the HTML
                // to its own origin.
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 bg-card border-b border-border/40">
                <p className="text-xs text-muted-foreground font-mono">
                  index.html
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => {
                    navigator.clipboard.writeText(htmlContent);
                    toast.success("HTML kopiert");
                  }}
                >
                  Kopieren
                </Button>
              </div>
              <textarea
                className="flex-1 p-4 font-mono text-xs bg-[#1e1e1e] text-[#d4d4d4] resize-none outline-none"
                value={htmlContent}
                onChange={e => {
                  setHtmlContent(e.target.value);
                  setHasChanges(true);
                }}
                spellCheck={false}
              />
              {hasChanges && (
                <div className="px-4 py-2 bg-card border-t border-border/40 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Ungespeicherte Änderungen
                  </p>
                  <Button
                    size="sm"
                    className="text-xs bg-primary text-primary-foreground"
                    onClick={() =>
                      updateHtmlMutation.mutate({ projectId, htmlContent })
                    }
                    disabled={updateHtmlMutation.isPending}
                  >
                    {updateHtmlMutation.isPending ? (
                      <Loader2 size={12} className="mr-1 animate-spin" />
                    ) : (
                      <Save size={12} className="mr-1" />
                    )}
                    Speichern
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="w-[360px] shrink-0 border-l border-border/60 bg-card flex flex-col">
            <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between shrink-0">
              <p className="text-xs font-semibold">Änderungen per Chat</p>
              <Button
                size="sm"
                variant="ghost"
                className="px-2 text-muted-foreground"
                onClick={() => setChatOpen(false)}
              >
                <X size={14} />
              </Button>
            </div>

            <div className="px-3 py-2 border-b border-border/40 shrink-0">
              {pendingImage ? (
                <div className="flex items-center gap-2 text-xs bg-secondary rounded-lg px-2.5 py-1.5">
                  <Paperclip
                    size={12}
                    className="text-muted-foreground shrink-0"
                  />
                  <span className="truncate flex-1">
                    {pendingImage.fileName}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingImage(null)}
                    className="text-muted-foreground hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Paperclip size={12} /> Bild anhängen
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAttachImage}
              />
            </div>

            <div className="flex-1 min-h-0">
              <AIChatBox
                messages={chatMessages}
                onSendMessage={handleSendChatMessage}
                isLoading={reviseMutation.isPending}
                placeholder="z.B. 'Mach den CTA-Button rot'"
                height="100%"
                className="rounded-none border-0 shadow-none"
                emptyStateMessage="Beschreibe, was an der Website geändert werden soll"
                suggestedPrompts={[
                  "Mach den Hero-Button auffälliger",
                  "Füge eine Telefonnummer im Footer hinzu",
                  "Ändere die Headline der Hero-Section",
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
