import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Session } from "@supabase/supabase-js";
import OwnerLogin from "./components/OwnerLogin";
import OwnerPasswordChange from "./components/OwnerPasswordChange";
import ArchiveDialog from "./components/ArchiveDialog";
import CollectionPicker from "./components/CollectionPicker";
import FontPicker from "./components/FontPicker";
import CardShadow from "./components/CardShadow";
import ShadowPicker from "./components/ShadowPicker";
import PoemSizeControl from "./components/PoemSizeControl";
import { usesStableRendering } from "./lib/browser";
import { defaultCardFont, getCardFont, type CardFontId } from "./lib/cardFonts";
import { getCardShadow, getCardShadowSource, type CardShadowId } from "./lib/cardShadows";
import { defaultPoemTextSize, getPoemTextSize } from "./lib/poemTextSize";
import { archiveRequest, authLog, deleteArchiveEntry, deleteEmptyArchiveCollection, supabase, toggleArchiveLike } from "./lib/supabase";

type Theme = {
  name: string;
  background: string;
  ink: string;
  accent: string;
};

type EntryCategory = "Poem" | "Prose" | "Note";
type EntryPeriod = "latest" | "previous";
type CardDraft = {
  author: string;
  title: string;
  body: string;
  activeTheme: number;
  fontFamily: CardFontId;
  shadowOverlay: CardShadowId;
  poemTextSize: number;
  category: EntryCategory;
  collection: string;
  isPublic: boolean;
  cardImage: string;
};
type ArchiveEntry = {
  number: string;
  title: string;
  excerpt: string;
  category: EntryCategory;
  date: string;
  created_at?: string;
  updated_at?: string;
  tone: string;
  author?: string;
  collection?: string;
  is_public: boolean;
  likes: number;
  image_url?: string | null;
  theme_background?: string;
  theme_ink?: string;
  theme_accent?: string;
  font_family?: string;
  shadow_overlay?: string;
  poem_text_size?: number;
};

const latestEntryCount = 6;

function entryPublicationTime(entry: ArchiveEntry) {
  const timestamp = Date.parse(entry.created_at || entry.date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

const themes: Theme[] = [
  { name: "Clay", background: "#bf593f", ink: "#fff9ee", accent: "#f4c7a1" },
  { name: "Night", background: "#172c2b", ink: "#f7f0df", accent: "#9fb5a6" },
  { name: "Paper", background: "#eee5d4", ink: "#29251f", accent: "#b64d36" },
  { name: "Rose", background: "#f1d9df", ink: "#542c3c", accent: "#8b4059" },
  { name: "Sage", background: "#dce5d6", ink: "#293e2c", accent: "#586e43" },
  { name: "Ocean", background: "#183c61", ink: "#f1f7fc", accent: "#9ed6e2" },
  { name: "Lilac", background: "#e5dcf2", ink: "#44325c", accent: "#765398" },
  { name: "Honey", background: "#f5dea2", ink: "#4c361d", accent: "#855525" },
  { name: "Ink", background: "#242329", ink: "#f5f2eb", accent: "#c4b7e3" },
  { name: "Sky", background: "#d9ebf4", ink: "#233e57", accent: "#426e91" },
  { name: "Wine", background: "#632c43", ink: "#fff2e6", accent: "#e5b2a2" },
  { name: "Pearl", background: "#faf9f5", ink: "#333735", accent: "#626c64" },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  const lines: string[] = [];
  text.split("\n").forEach((paragraph) => {
    if (!paragraph.trim()) {
      lines.push("");
      return;
    }
    const words = paragraph.split(" ");
    let line = words.shift() ?? "";
    words.forEach((word) => {
      const testLine = `${line} ${word}`;
      if (context.measureText(testLine).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    lines.push(line);
  });
  return lines;
}

function readImageFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded."));
    image.src = source;
  });
}

function getLikeVoterId() {
  const storageKey = "marginalia-like-voter-id";
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(storageKey, created);
  return created;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [passwordChangeOpen, setPasswordChangeOpen] = useState(false);
  const [passwordChangeDeferred, setPasswordChangeDeferred] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [accessStatus, setAccessStatus] = useState("");
  const studioRef = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState("All");
  const [entryPeriod, setEntryPeriod] = useState<EntryPeriod>("latest");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("");
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collectionQuery, setCollectionQuery] = useState("");
  const [reading, setReading] = useState<ArchiveEntry | null>(null);
  const [readerShareStatus, setReaderShareStatus] = useState("");
  const [readerSharing, setReaderSharing] = useState(false);
  const [category, setCategory] = useState<EntryCategory>("Poem");
  const [collection, setCollection] = useState("Personal collection");
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [savedCollectionNames, setSavedCollectionNames] = useState<string[]>([]);
  const [deletingCollection, setDeletingCollection] = useState<string | null>(null);
  const [collectionStatus, setCollectionStatus] = useState("");
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const entries = archiveEntries;
  const [archiveCounts, setArchiveCounts] = useState<{ pieces: number; collections: number } | null>(null);
  const [archiveError, setArchiveError] = useState("");
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [loadingScreenVisible, setLoadingScreenVisible] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [sharing, setSharing] = useState(false);
  const [deletingNumber, setDeletingNumber] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ArchiveEntry | null>(null);
  const [editingNumber, setEditingNumber] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [poetName, setPoetName] = useState("Mikhai");
  const [poetQuote, setPoetQuote] = useState("I write to notice what would otherwise pass me by.");
  const [poetBio, setPoetBio] = useState("I’m Mikhai, a poet and observer of ordinary wonders. My work lives somewhere between memory and morning light.");
  const [poetTextSize, setPoetTextSize] = useState(100);
  const [poetTextColor, setPoetTextColor] = useState("#28261f");
  const [archiveVolume, setArchiveVolume] = useState("1");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [cardImage, setCardImage] = useState("");
  const [preparedCard, setPreparedCard] = useState<{ file: File; draft: CardDraft } | null>(null);
  const [likeVoterId] = useState(getLikeVoterId);
  const [likedNumbers, setLikedNumbers] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("marginalia-liked-entries") || "[]") as string[]; } catch { return []; }
  });
  const [colorMode, setColorMode] = useState<"light" | "dark">(() => {
    const preference = localStorage.getItem("marginalia-color-mode");
    return preference === "dark" || (!preference && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  });
  const [selectedSection, setSelectedSection] = useState("top");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [author, setAuthor] = useState("Mikhai");
  const [title, setTitle] = useState("Ways to Stay");
  const [body, setBody] = useState(
    "Be the window left open,\nthe kettle still warm,\nthe light that says:\nI knew you would return.",
  );
  const [activeTheme, setActiveTheme] = useState(0);
  const [fontFamily, setFontFamily] = useState<CardFontId>(defaultCardFont.id);
  const [shadowOverlay, setShadowOverlay] = useState<CardShadowId>("none");
  const [poemTextSize, setPoemTextSize] = useState(defaultPoemTextSize);
  const poemScale = poemTextSize / 100;
  const font = getCardFont(fontFamily);
  const theme = themes[activeTheme];
  const poetScale = poetTextSize / 100;
  const volumeNumber = Number(archiveVolume);
  const volumeValid = Number.isInteger(volumeNumber) && volumeNumber >= 1 && volumeNumber <= 9999;
  const volumeLabel = volumeValid ? volumeNumber : 1;
  const collectionValid = Boolean(collection.trim());
  const canDeleteCollection = !creatingCollection && !archiveLoading && !archiveError && savedCollectionNames.includes(collection) && !entries.some((entry) => entry.collection === collection);
  const updateCollection = (name: string, creatingNew: boolean) => {
    setCollection(name);
    setCreatingCollection(creatingNew);
    setCollectionStatus("");
  };
  // Compare draft references without copying a potentially large image data URL.
  const cardDraft = useMemo(
    () => ({ author, title, body, activeTheme, fontFamily, shadowOverlay, poemTextSize, category, collection, isPublic, cardImage }),
    [author, title, body, activeTheme, fontFamily, shadowOverlay, poemTextSize, category, collection, isPublic, cardImage],
  );
  const collectionNames = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.collection).filter((name): name is string => Boolean(name)))).sort(),
    [entries],
  );
  const orderedEntries = useMemo(() => [...entries].sort((first, second) =>
    entryPublicationTime(second) - entryPublicationTime(first) ||
    (Date.parse(second.date) || 0) - (Date.parse(first.date) || 0) ||
    first.number.localeCompare(second.number),
  ), [entries]);
  const periodEntries = useMemo(() => entryPeriod === "latest"
    ? orderedEntries.slice(0, latestEntryCount)
    : orderedEntries.slice(latestEntryCount),
  [orderedEntries, entryPeriod]);
  const visibleEntries = useMemo(() => {
    const searchQuery = query.toLowerCase();
    return periodEntries.filter((poem) =>
      (filter === "All" || poem.category === filter) &&
      (!collectionFilter || poem.collection === collectionFilter) &&
      `${poem.title} ${poem.excerpt}`.toLowerCase().includes(searchQuery),
    );
  }, [periodEntries, filter, collectionFilter, query]);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authLog("state_change", { event, hasSession: Boolean(nextSession), userId: nextSession?.user.id ?? null, expiresAt: nextSession?.expires_at ?? null });
      if (event === "SIGNED_OUT") setSession(null);
      else if (nextSession) setSession(nextSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!archiveLoading) setLoadingScreenVisible(false);
  }, [archiveLoading]);

  useEffect(() => {
    let cancelled = false;
    if (!session) {
      setIsOwner(false);
      setPasswordChangeOpen(false);
      setPasswordChangeDeferred(false);
      return;
    }
    archiveRequest("/owner", session.access_token).then(() => {
      authLog("owner_verified", { userId: session.user.id });
      if (!cancelled) {
        setIsOwner(true);
        if (!passwordChangeDeferred) setPasswordChangeOpen(session.user.user_metadata?.password_changed !== true);
        setAccessStatus("");
      }
    }).catch((error) => {
      authLog("owner_verification_failed", { userId: session.user.id, error: error instanceof Error ? error.message : String(error) });
      if (!cancelled) setAccessStatus(error instanceof Error ? error.message : "Owner access could not be verified.");
    });
    return () => { cancelled = true; };
  }, [session?.user.id, passwordChangeDeferred]);

  useEffect(() => {
    let cancelled = false;
    archiveRequest("/profile").then((profile) => {
      if (cancelled) return;
      setPoetName(profile.poet_name);
      setPoetQuote(profile.quote);
      setPoetBio(profile.bio);
      setPoetTextSize(profile.text_size);
      setPoetTextColor(profile.text_color);
      setArchiveVolume(String(profile.volume ?? 1));
    }).catch(() => {
      if (!cancelled) setProfileStatus("The poet profile could not be loaded.");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestSequence = 0;
    let refreshTimer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const sequence = ++requestSequence;
      try {
        const result = await archiveRequest("/entries");
        if (cancelled || sequence !== requestSequence) return;
        setArchiveEntries(result.entries);
        setSavedCollectionNames(result.collectionNames);
        setArchiveCounts({ pieces: result.pieces, collections: result.collections });
        setArchiveError("");
      } catch (error) {
        if (!cancelled && sequence === requestSequence) setArchiveError(error instanceof Error ? error.message : "The archive could not be loaded.");
      } finally {
        if (!cancelled && sequence === requestSequence) setArchiveLoading(false);
      }
    };
    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void refresh(); }, 150);
    };
    const refreshOnVisibility = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    const channel = supabase.channel("personal-archive-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "archive_entries" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "archive_collections" }, scheduleRefresh)
      .subscribe((status) => {
        if (cancelled) return;
        setRealtimeConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") scheduleRefresh();
      });
    window.addEventListener("archive-published", scheduleRefresh);
    window.addEventListener("online", scheduleRefresh);
    document.addEventListener("visibilitychange", refreshOnVisibility);
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
      window.removeEventListener("archive-published", scheduleRefresh);
      window.removeEventListener("online", scheduleRefresh);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  const logOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) { setAccessStatus("Unable to sign out. Please try again."); return; }
    setIsOwner(false);
    setPasswordChangeOpen(false);
    setPasswordChangeDeferred(false);
    setAccessStatus("");
    setSelectedSection("top");
    document.getElementById("top")?.scrollIntoView({ behavior: "smooth" });
  };

  const changeColorMode = (mode: "light" | "dark") => {
    if (mode === colorMode) return;
    const update = () => setColorMode(mode);
    if (!usesStableRendering && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && "startViewTransition" in document) document.startViewTransition(update);
    else update();
  };

  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
    localStorage.setItem("marginalia-color-mode", colorMode);
  }, [colorMode]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [sidebarOpen]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting);
      if (visible.length) setSelectedSection(visible[0].target.id);
    }, { rootMargin: "-15% 0px -55% 0px" });
    ["top", "poems", "about", "studio"].forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    return () => observer.disconnect();
  }, [isOwner]);

  useEffect(() => {
    if (usesStableRendering || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = document.querySelectorAll(".section-heading, .poem-card, .about > *, .studio-heading, .editor, .card-preview");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove("reveal-waiting");
        entry.target.classList.add("reveal-arrived");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08 });
    elements.forEach((element) => {
      if (!element.classList.contains("reveal-arrived")) {
        element.classList.add("reveal-waiting");
        observer.observe(element);
      }
    });
    return () => {
      observer.disconnect();
      elements.forEach((element) => element.classList.remove("reveal-waiting"));
    };
  }, [visibleEntries, isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    const draft = localStorage.getItem("verse-poem-draft");
    if (!draft) return;
    try {
      const parsed = JSON.parse(draft);
      setAuthor(parsed.author || "Mara Ellis");
      setTitle(parsed.title || "Ways to Stay");
      setBody(parsed.body || body);
      setActiveTheme(parsed.activeTheme ?? 0);
      setFontFamily(getCardFont(parsed.fontFamily).id);
      setShadowOverlay(getCardShadow(parsed.shadowOverlay).id);
      setPoemTextSize(getPoemTextSize(parsed.poemTextSize));
      if (["Poem", "Prose", "Note"].includes(parsed.category)) setCategory(parsed.category);
      if (typeof parsed.collection === "string") setCollection(parsed.collection.trim() || "Personal collection");
      setCreatingCollection(false);
    } catch {
      localStorage.removeItem("verse-poem-draft");
    }
    // The starter poem is intentionally used only when no saved draft exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const createCard = async (entry?: ArchiveEntry, format: "post" | "story" = "post", signal?: AbortSignal) => {
    const cardFont = getCardFont(entry ? entry.font_family : fontFamily);
    await Promise.allSettled([
      document.fonts.load(`400 43px ${cardFont.family}`),
      document.fonts.load(`600 74px ${cardFont.family}`),
    ]);
    await document.fonts.ready;
    if (signal?.aborted) return null;
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = format === "story" ? 1920 : 1080;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const cardTheme = {
      background: entry?.theme_background || theme.background,
      ink: entry?.theme_ink || theme.ink,
      accent: entry?.theme_accent || theme.accent,
    };
    context.fillStyle = cardTheme.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const imageSource = entry ? entry.image_url : cardImage;
    if (imageSource) {
      const image = await loadImage(imageSource);
      if (signal?.aborted) return null;
      const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.globalAlpha = .28;
      context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
      context.globalAlpha = 1;
    }
    const shadowSource = getCardShadowSource(entry ? entry.shadow_overlay : shadowOverlay);
    if (shadowSource) {
      const shadow = await loadImage(shadowSource);
      if (signal?.aborted) return null;
      const scale = Math.max(canvas.width / shadow.naturalWidth, canvas.height / shadow.naturalHeight);
      const width = shadow.naturalWidth * scale, height = shadow.naturalHeight * scale;
      context.drawImage(shadow, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }
    context.strokeStyle = cardTheme.accent;
    context.lineWidth = 2;
    context.strokeRect(52, 52, 976, canvas.height - 104);
    context.translate(0, (canvas.height - 1080) / 2);

    context.fillStyle = cardTheme.accent;
    context.font = "500 22px Arial";
    context.letterSpacing = "5px";
    context.fillText(`A ${(entry?.category || category).toUpperCase()} BY`, 104, 126);

    context.fillStyle = cardTheme.ink;
    context.font = `600 74px ${cardFont.family}`;
    context.letterSpacing = "0px";
    const titleLines = wrapText(context, entry?.title || title || "Untitled", 870);
    titleLines.slice(0, 2).forEach((line, index) => {
      context.fillText(line, 104, 244 + index * 82);
    });

    const poemTop = 244 + titleLines.slice(0, 2).length * 82 + 54;
    context.fillStyle = cardTheme.ink;
    const cardBody = entry ? entry.excerpt : body;
    let fontSize = Math.round(43 * getPoemTextSize(entry ? entry.poem_text_size : poemTextSize) / 100);
    context.font = `400 ${fontSize}px ${cardFont.family}`;
    let poemLines = wrapText(context, cardBody, 850);
    while (fontSize > 16 && poemTop + (poemLines.length - 1) * fontSize * 1.48 > 870) {
      fontSize -= 1;
      context.font = `400 ${fontSize}px ${cardFont.family}`;
      poemLines = wrapText(context, cardBody, 850);
    }
    poemLines.forEach((line, index) => {
      context.fillText(line, 104, poemTop + index * fontSize * 1.48);
    });

    context.fillStyle = cardTheme.accent;
    context.fillRect(104, 938, 64, 3);
    context.fillStyle = cardTheme.ink;
    context.font = "500 25px Arial";
    context.fillText(entry?.author || author || "Anonymous", 190, 947);
    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
  };

  const shareArchiveEntry = async (format: "post" | "story") => {
    if (!reading || readerSharing) return;
    setReaderSharing(true);
    setReaderShareStatus("Preparing your " + format + " image…");
    const instagramWindow = window.open("", "_blank");
    if (instagramWindow) instagramWindow.opener = null;
    try {
      const blob = await createCard(reading, format);
      if (!blob) throw new Error("Image generation failed");
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `${reading.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${format}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60000);
      if (instagramWindow) instagramWindow.location.replace("https://www.instagram.com/");
      setReaderShareStatus(instagramWindow
        ? `Image download started. Instagram is open—create a ${format} and select the downloaded image.`
        : `Image download started. Your browser blocked the Instagram tab. Use Open Instagram below to create a ${format} with your image.`);
    } catch {
      instagramWindow?.close();
      setReaderShareStatus("The image could not be created. Please try again.");
    } finally {
      setReaderSharing(false);
    }
  };

  useEffect(() => {
    if (!isOwner) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      createCard(undefined, "post", controller.signal).then((blob) => {
        if (controller.signal.aborted || !blob) return;
        const filename = (title || category).toLowerCase().replace(/[^a-z0-9]+/g, "-");
        setPreparedCard({ file: new File([blob], `${filename}.png`, { type: "image/png" }), draft: cardDraft });
      }).catch(() => {
        if (!controller.signal.aborted) setShareStatus("The image could not be prepared. Please edit your piece and try again.");
      });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cardDraft, isOwner]);

  const sharePoem = async (shouldShare = true) => {
    if (!isOwner || !session || sharing || deletingCollection || !body.trim() || !collectionValid || preparedCard?.draft !== cardDraft) return;
    const file = preparedCard.file;
    const existing = editingNumber
      ? archiveEntries.find((entry) => entry.number === editingNumber)
      : archiveEntries.find((entry) => entry.title === (title.trim() || "Untitled") && entry.excerpt === body.trim() && entry.category === category && entry.author === author);
    const entry: ArchiveEntry = {
      number: existing?.number || crypto.randomUUID(),
      title: title.trim() || "Untitled",
      excerpt: body.trim(),
      category,
      author,
      collection: collection.trim() || "Personal collection",
      is_public: isPublic,
      image_url: cardImage || null,
      theme_background: theme.background,
      theme_ink: theme.ink,
      theme_accent: theme.accent,
      font_family: fontFamily,
      shadow_overlay: shadowOverlay,
      poem_text_size: poemTextSize,
      likes: existing?.likes || 0,
      date: existing?.date || new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
      tone: category === "Poem" ? "blush" : category === "Prose" ? "sage" : "sand",
    };
    setSharing(true);
    const instagramWindow = shouldShare ? window.open("", "_blank") : null;
    if (instagramWindow) instagramWindow.opener = null;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Please sign in again to publish your piece.");
      const result = await archiveRequest("/entries", data.session.access_token, entry);
      setArchiveEntries((current) => [result.entry, ...current.filter((item) => item.number !== entry.number)]);
      setSavedCollectionNames((current) => Array.from(new Set([...current, result.entry.collection])));
      setCollection(result.entry.collection);
      setCreatingCollection(false);
      setEditingNumber(null);
      window.dispatchEvent(new Event("archive-published"));
    } catch (error) {
      instagramWindow?.close();
      setShareStatus(error instanceof Error ? error.message : "The archive could not be saved. Please try again.");
      setSharing(false);
      return;
    }
    if (!shouldShare) {
      setShareStatus("Archive entry updated.");
      setSharing(false);
      setEditOpen(false);
      return;
    }
    try { localStorage.setItem("verse-poem-draft", JSON.stringify(cardDraft)); } catch {}
    setFilter("All");
    setQuery("");
    setEntryPeriod("latest");
    if (instagramWindow) {
      instagramWindow.location.replace("https://www.instagram.com/");
    }
    const link = document.createElement("a");
    const imageUrl = URL.createObjectURL(file);
    link.download = file.name;
    link.href = imageUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(imageUrl), 60000);
    setShareStatus(instagramWindow
      ? "Saved to your archive and image download started. Instagram is open in a new tab. Create a post and choose your downloaded image."
      : "Saved to your archive and image download started. Your browser blocked the Instagram tab. Use Open Instagram below, then create a post with your downloaded image.");
    setSharing(false);
  };

  const editArchiveEntry = (entry: ArchiveEntry) => {
    setEditingNumber(entry.number);
    setAuthor(entry.author || "Mara Ellis");
    setTitle(entry.title);
    setBody(entry.excerpt);
    setCategory(entry.category);
    setCollection(entry.collection || "Personal collection");
    setCreatingCollection(false);
    setIsPublic(entry.is_public);
    setCardImage(entry.image_url || "");
    setFontFamily(getCardFont(entry.font_family).id);
    setShadowOverlay(getCardShadow(entry.shadow_overlay).id);
    setPoemTextSize(getPoemTextSize(entry.poem_text_size));
    const matchingTheme = themes.findIndex((option) => option.background === entry.theme_background && option.ink === entry.theme_ink && option.accent === entry.theme_accent);
    if (matchingTheme >= 0) setActiveTheme(matchingTheme);
    setShareStatus("");
    setCollectionStatus("");
    setEditOpen(true);
  };

  const removeEmptyCollection = async () => {
    if (!session || !isOwner || !canDeleteCollection || deletingCollection || sharing) return;
    const name = collection;
    setDeletingCollection(name);
    setCollectionStatus("");
    try {
      await deleteEmptyArchiveCollection(name, session.access_token);
      const remaining = savedCollectionNames.filter((savedName) => savedName !== name);
      setSavedCollectionNames(remaining);
      setCollection(remaining[0] || "");
      setCreatingCollection(remaining.length === 0);
      if (collectionFilter === name) setCollectionFilter("");
      setArchiveCounts((current) => current ? { ...current, collections: Math.max(0, current.collections - 1) } : current);
      setCollectionStatus(`Deleted “${name}”.`);
      window.dispatchEvent(new Event("archive-published"));
    } catch (error) {
      setCollectionStatus(error instanceof Error ? error.message : "The collection could not be deleted.");
    } finally {
      setDeletingCollection(null);
    }
  };

  const savePoetProfile = async () => {
    if (!session || profileSaving) return;
    if (!volumeValid) {
      setProfileStatus("Volume must be a whole number from 1 to 9999.");
      return;
    }
    setProfileSaving(true);
    setProfileStatus("");
    try {
      const profile = await archiveRequest("/profile", session.access_token, {
        poet_name: poetName.trim() || "Mikhai",
        quote: poetQuote.trim() || "I write to notice what would otherwise pass me by.",
        bio: poetBio.trim() || "I’m Mikhai, a poet and observer of ordinary wonders. My work lives somewhere between memory and morning light.",
        text_size: poetTextSize,
        text_color: poetTextColor,
        volume: volumeNumber,
      });
      setPoetName(profile.poet_name);
      setPoetQuote(profile.quote);
      setPoetBio(profile.bio);
      setArchiveVolume(String(profile.volume ?? volumeNumber));
      setProfileStatus("Archive settings saved.");
    } catch (error) {
      setProfileStatus(error instanceof Error ? error.message : "The poet profile could not be saved.");
    } finally {
      setProfileSaving(false);
    }
  };

  const removeArchiveEntry = async (entry: ArchiveEntry) => {
    if (!session || deletingNumber) return;
    setDeletingNumber(entry.number);
    setShareStatus("");
    try {
      await deleteArchiveEntry(entry.number, session.access_token);
      setArchiveEntries((current) => current.filter((item) => item.number !== entry.number));
      if (editingNumber === entry.number) setEditingNumber(null);
      window.dispatchEvent(new Event("archive-published"));
    } catch (error) {
      setShareStatus(error instanceof Error ? error.message : "The entry could not be deleted. Please try again.");
    } finally {
      setDeletingNumber(null);
    }
  };

  const toggleLike = async (entry: ArchiveEntry) => {
    const liked = !likedNumbers.includes(entry.number);
    const previous = likedNumbers;
    const next = liked ? [...likedNumbers, entry.number] : likedNumbers.filter((number) => number !== entry.number);
    setLikedNumbers(next);
    localStorage.setItem("marginalia-liked-entries", JSON.stringify(next));
    setArchiveEntries((current) => current.map((item) => item.number === entry.number ? { ...item, likes: Math.max(0, item.likes + (liked ? 1 : -1)) } : item));
    try {
      const result = await toggleArchiveLike(entry.number, likeVoterId, liked);
      setArchiveEntries((current) => current.map((item) => item.number === entry.number ? { ...item, likes: result.count } : item));
    } catch {
      setLikedNumbers(previous);
      localStorage.setItem("marginalia-liked-entries", JSON.stringify(previous));
      setArchiveEntries((current) => current.map((item) => item.number === entry.number ? { ...item, likes: entry.likes } : item));
    }
  };

  const requestDelete = (entry: ArchiveEntry) => setDeleteCandidate(entry);

  return (
    <main className="portfolio-shell">
      {loadingScreenVisible && <div className="archive-loading-screen" role="status" aria-live="polite">
        <div className="archive-loading-orbit" aria-hidden="true"><i /><i /><i /></div>
        <p className="eyebrow">Personal archive · VOL {volumeLabel}</p>
        <h1>Words for the<br /><em>quiet hours.</em></h1>
        <span className="archive-loading-label">Gathering the archive</span>
      </div>}
      <button className="sidebar-toggle" aria-label={sidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={sidebarOpen} aria-controls="portfolio-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? "×" : "☰"}</button>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside id="portfolio-sidebar" className={`portfolio-sidebar ${sidebarOpen ? "is-open" : ""}`}>
        <a className="sidebar-brand" href="#top" onClick={() => setSidebarOpen(false)}><strong className="archive-name">Mikhai:</strong><span>A Personal Archive</span></a>
        <p className="sidebar-label">Explore</p>
        <nav aria-label="Portfolio sections">
          {[{ id: "top", label: "Quiet hours", number: "01" }, { id: "poems", label: "The archive", number: "02" }, { id: "about", label: "The poet", number: "03" }, ...(isOwner ? [{ id: "studio", label: "Card studio", number: "04" }] : [])].map((section) => <a key={section.id} href={`#${section.id}`} className={selectedSection === section.id ? "is-selected" : ""} aria-current={selectedSection === section.id ? "location" : undefined} onClick={() => { setSelectedSection(section.id); setSidebarOpen(false); }}><span>{section.number}</span>{section.label}<span className="section-indicator">↗</span></a>)}
        </nav>
        <div className="sidebar-bottom">
          <p className="sidebar-label">Appearance</p>
          <div className="mode-selector" aria-label="Color mode">{(["light", "dark"] as const).map((mode) => <button key={mode} aria-pressed={colorMode === mode} className={colorMode === mode ? "is-selected" : ""} onClick={() => changeColorMode(mode)}><span aria-hidden="true">{mode === "light" ? "☀" : "☾"}</span>{mode === "light" ? "Light" : "Dark"}</button>)}</div>
          <p className="sidebar-footnote">A little space for<br />words worth keeping.</p>
        </div>
      </aside>
      <OwnerLogin open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={() => { setIsOwner(true); setLoginOpen(false); }} />
      <OwnerPasswordChange open={passwordChangeOpen} onComplete={() => setPasswordChangeOpen(false)} onLogout={() => void logOut()} onSkip={() => { setPasswordChangeDeferred(true); setPasswordChangeOpen(false); setIsOwner(true); }} />
      <section className="hero" id="top">
        <div className="hero-top">
          <p className="eyebrow">Personal archive · VOL {volumeLabel}</p>
          <div className="hero-actions">
          <button className={`search-toggle owner-toggle ${isOwner ? "is-owner" : ""}`} aria-label={isOwner ? "Sign out of Card Studio" : "Owner login"} title={isOwner ? "Sign out of Card Studio" : "Owner login"} onClick={() => { if (isOwner) void logOut(); else setLoginOpen(true); }}>
            {isOwner ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4H5v16h5M9 12h12m-4-4 4 4-4 4" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg>}
          </button>
          <button className="search-toggle" aria-label="Search the archive" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); if (!searchOpen) document.getElementById("poems")?.scrollIntoView({ behavior: "smooth" }); }}>
            <svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></svg>
          </button>
          </div>
        </div>
        {accessStatus && <p className="owner-access-status" role="status">{accessStatus}</p>}
        <div className="hero-main">
          <h1>Words for the<br /><em>quiet hours.</em></h1>
          <p className="intro">A living collection of poems, fragments, and observations on softness, memory, and the small things that make a life.</p>
        </div>
        <div className="hero-bottom">
          <div className="archive-stats" aria-live="polite"><span><strong>{archiveCounts ? String(archiveCounts.pieces).padStart(2, "0") : "—"}</strong> Pieces</span><span><strong>{archiveCounts ? String(archiveCounts.collections).padStart(2, "0") : "—"}</strong> Collections</span></div>
        </div>
      </section>

      <header className="site-header">
        <a className="wordmark" href="#top"><span className="brand-symbol" aria-hidden="true">♧</span><span className="archive-name">Mikhai: A Personal Archive</span></a>
        <nav aria-label="Main navigation"><a className="works-link" href="#poems">Read the works</a></nav>
      </header>
      <section className="collection" id="poems">
        <div className="section-heading">
          <div>
            <p className="eyebrow">The archive</p>
            <h2>{entryPeriod === "latest" ? "Latest entries" : "Previous entries"}</h2>
          </div>
          <div className="archive-heading-actions">
            <div className="archive-period-filters" role="group" aria-label="Entry period">
              {(["latest", "previous"] as const).map((period) => <button key={period} aria-pressed={entryPeriod === period} className={entryPeriod === period ? "selected" : ""} onClick={() => setEntryPeriod(period)}>{period === "latest" ? "Latest entries" : "Previous entries"}</button>)}
            </div>
            <button className="collection-open-button" onClick={() => setCollectionsOpen(true)}>Browse collections <ArrowIcon /></button>
            <div className="archive-filters" aria-label="Filter entries">{["All", "Poem", "Prose", "Note"].map((category) => <button key={category} aria-pressed={filter === category} className={filter === category ? "selected" : ""} onClick={() => setFilter(category)}>{category}</button>)}</div>
          </div>
        </div>
        {!archiveLoading && entries.length > 0 && <p className="archive-period-description">{entryPeriod === "latest" ? "The six most recent pieces. Earlier pieces are in Previous entries." : "Earlier pieces, with the most recent first."}</p>}
        {archiveError && <p className="archive-share-status" role="alert">{archiveError}</p>}
        {archiveLoading && <p className="empty-archive" role="status">Gathering the latest entries…</p>}
        {!archiveLoading && !archiveError && entries.length === 0 && <p className="empty-archive">The archive is quiet for now. New pieces will appear here when published.</p>}
        {shareStatus && <div className="archive-share-status"><p role="status">{shareStatus}</p><a className="instagram-open-link" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Open Instagram ↗</a></div>}
        {searchOpen && <input className="archive-search" aria-label="Search entries" placeholder="Find a title or a line…" value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />}
        <div className="poem-grid">
          {visibleEntries.map((poem) => (
            <article className="poem-card" key={poem.number} onClick={(event) => { if ((event.target as HTMLElement).closest("button, a")) return; setReading(poem); setReaderShareStatus(""); }}>
              <div
                className={`quote-panel ${poem.tone}${poem.image_url ? " has-card-image" : ""}`}
                style={{
                  backgroundColor: poem.theme_background,
                  color: poem.theme_ink,
                  "--quote-image-color": poem.theme_background,
                  "--quote-image": poem.image_url ? `url(${JSON.stringify(poem.image_url)})` : undefined,
                } as CSSProperties}
              >
                <span aria-hidden="true">“</span>
                <CardShadow value={poem.shadow_overlay} />
                <blockquote style={{ fontFamily: getCardFont(poem.font_family).family, fontSize: `${25 * getPoemTextSize(poem.poem_text_size) / 100}px`, color: poem.theme_ink }}>{poem.excerpt}</blockquote>
              </div>
              <div className="entry-content">
              <div className="poem-meta">
                <span>{poem.category}</span>
                <span>{poem.date}</span>
              </div>
              <h3 style={{ fontFamily: getCardFont(poem.font_family).family }}>{poem.title}</h3>
              {poem.collection && <span className="entry-collection">From {poem.collection}</span>}
              <p style={{ fontFamily: getCardFont(poem.font_family).family, fontSize: `${17 * getPoemTextSize(poem.poem_text_size) / 100}px` }}>{poem.excerpt}</p>
              <div className="entry-actions">
                <button className={`favorite-button ${likedNumbers.includes(poem.number) ? "is-liked" : ""}`} aria-label={`${likedNumbers.includes(poem.number) ? "Unlike" : "Like"} ${poem.title}`} aria-pressed={likedNumbers.includes(poem.number)} onClick={() => void toggleLike(poem)}><svg viewBox="0 0 24 24" fill={likedNumbers.includes(poem.number) ? "currentColor" : "none"}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg><span>{poem.likes}</span></button>
                <button aria-label={`Read ${poem.title}`} onClick={() => { setReading(poem); setReaderShareStatus(""); }}>Read piece <ArrowIcon /></button>
                {isOwner && <>
                  <button className="entry-edit-button" aria-label={`Edit ${poem.title}`} onClick={() => editArchiveEntry(poem)}>Edit</button>
                  <button className="entry-delete-button" aria-label={`Delete ${poem.title}`} disabled={deletingNumber === poem.number} onClick={() => requestDelete(poem)}>{deletingNumber === poem.number ? "Deleting…" : "Delete"}</button>
                </>}
              </div>
              </div>
            </article>
          ))}
        </div>
        {!archiveLoading && !archiveError && entries.length > 0 && visibleEntries.length === 0 && <p className="empty-archive">{entryPeriod === "previous" && periodEntries.length === 0 ? "No previous entries yet. Earlier pieces will appear here as the archive grows." : "No entries found in this group. Try another filter or entry period."}</p>}
      </section>
      <ArchiveDialog open={collectionsOpen} onClose={() => setCollectionsOpen(false)} closeLabel="Close collections" ariaLabel="Browse collections" className="collections-modal">
        <p className="eyebrow">The archive</p>
        <h2>Browse collections.</h2>
        <input className="collection-search" aria-label="Search collections" placeholder="Search collections…" value={collectionQuery} onChange={(event) => setCollectionQuery(event.target.value)} />
        <div className="collection-stack">
          {collectionNames.filter((name) => name.toLowerCase().includes(collectionQuery.toLowerCase())).map((name, index) => <button key={name} className="collection-stack-card" style={{ animationDelay: `${index * 60}ms` }} onClick={() => { setCollectionFilter(name); setCollectionsOpen(false); document.getElementById("poems")?.scrollIntoView({ behavior: "smooth" }); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong><small>{entries.filter((entry) => entry.collection === name).length} pieces</small><ArrowIcon /></button>)}
        </div>
        {collectionFilter && <button className="clear-collection-filter" onClick={() => { setCollectionFilter(""); setCollectionsOpen(false); }}>Show all collections</button>}
      </ArchiveDialog>
      <ArchiveDialog open={editOpen} onClose={() => setEditOpen(false)} closeLabel="Close edit entry" ariaLabel="Edit this piece" className="edit-modal">
        <p className="eyebrow">Card studio</p>
        <h2>Edit this piece.</h2>
        <div className="edit-modal-fields">
          <label>Type<select value={category} onChange={(event) => setCategory(event.target.value as EntryCategory)}><option>Poem</option><option>Prose</option><option>Note</option></select></label>
          <CollectionPicker names={savedCollectionNames} value={collection} creatingNew={creatingCollection} onChange={updateCollection} autoFocusNew={editOpen} onDelete={canDeleteCollection ? () => void removeEmptyCollection() : undefined} deleting={deletingCollection !== null} disabled={sharing} status={collectionStatus} />
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={48} /></label>
          <label>Author<input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={40} /></label>
          <label className="edit-modal-wide">Text<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={360} rows={6} style={{ fontFamily: font.family, fontSize: `${Math.max(16, 21 * poemScale)}px` }} /></label>
          <FontPicker value={fontFamily} onChange={setFontFamily} />
          <label>Visibility<select value={isPublic ? "public" : "hidden"} onChange={(event) => setIsPublic(event.target.value === "public")}><option value="public">Public</option><option value="hidden">Hidden</option></select></label>
          <div className="edit-modal-wide"><PoemSizeControl value={poemTextSize} onChange={setPoemTextSize} /></div>
          <label className="edit-modal-wide">Image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImageFile(file).then(setCardImage); }} /></label>
        </div>
        <div className="edit-modal-palette"><p className="eyebrow">Palette</p><div className="theme-options">{themes.map((option, index) => <button type="button" className={activeTheme === index ? "active" : ""} key={option.name} onClick={() => setActiveTheme(index)} style={activeTheme === index ? { backgroundColor: option.background, color: option.ink, borderColor: option.accent } : undefined} aria-pressed={activeTheme === index}>{option.name}</button>)}</div><div className="edit-style-preview" style={{ backgroundColor: theme.background, color: theme.ink, borderColor: theme.accent, fontFamily: font.family }}><CardShadow value={shadowOverlay} /><strong>{title || "Untitled"}</strong><p style={{ fontSize: `${20 * poemScale}px` }}>{body || "Your words will appear here."}</p></div></div>
        <ShadowPicker value={shadowOverlay} onChange={setShadowOverlay} />
        <button className="profile-save-button" onClick={() => void sharePoem(false)} disabled={sharing || deletingCollection !== null || !body.trim() || !collectionValid || preparedCard?.draft !== cardDraft}>{sharing ? "Saving…" : "Save changes"}</button>
        {shareStatus && <p className="studio-share-feedback" role="status">{shareStatus}</p>}
      </ArchiveDialog>
      <ArchiveDialog open={reading !== null} onClose={() => setReading(null)} closeLabel="Close poem" ariaLabel={reading?.title || "Read poem"}>
        <div className="reader-palette" style={{ backgroundColor: reading?.theme_background, color: reading?.theme_ink, borderColor: reading?.theme_accent }}>
          <CardShadow value={reading?.shadow_overlay} />
          {reading?.image_url && <img src={reading.image_url} alt="" />}
          <p className="eyebrow">{reading?.category} · {reading?.date}</p><h2 style={{ fontFamily: getCardFont(reading?.font_family).family }}>{reading?.title}</h2><p className="reader-body" style={{ fontFamily: getCardFont(reading?.font_family).family, fontSize: `${25 * getPoemTextSize(reading?.poem_text_size) / 100}px` }}>{reading?.excerpt}</p>
        </div>
        <div className="reader-share-section">
          <p className="eyebrow">Share on Instagram</p>
          <div className="reader-share-options">
            <button disabled={readerSharing} onClick={() => shareArchiveEntry("post")}><InstagramIcon /><span>Share as post<small>Square · 1080 × 1080</small></span><ArrowIcon /></button>
            <button disabled={readerSharing} onClick={() => shareArchiveEntry("story")}><InstagramIcon /><span>Share as story<small>Portrait · 1080 × 1920</small></span><ArrowIcon /></button>
          </div>
          <p className="reader-share-hint">Downloads your image with this piece’s saved card style, then opens Instagram. Select the image there to finish posting.</p>
          {readerShareStatus && <div className="reader-share-feedback"><p role="status">{readerShareStatus}</p><a className="instagram-open-link" href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Open Instagram ↗</a></div>}
        </div>
      </ArchiveDialog>

      <section className="about" id="about">
        <div className="about-mark" aria-hidden="true">“</div>
        <blockquote style={{ color: poetTextColor.toLowerCase() === "#28261f" ? "var(--archive-ink)" : poetTextColor, fontSize: `clamp(${2.5 * poetScale}rem, ${4 * poetScale}vw, ${4.5 * poetScale}rem)` }}>
          {poetQuote}
        </blockquote>
        <div className="about-copy">
          <p className="eyebrow">The poet</p>
          <p>{poetBio.replace("Mikhai", poetName)}</p>
        </div>
      </section>

      {isOwner && <section className="studio" id="studio" ref={studioRef}>
        <div className="studio-heading">
          <div className="studio-heading-top"><p className="eyebrow">The card studio</p></div>
          <h2>Make it <em>your own.</em></h2>
          <p>A little space for your words. Write, choose a mood, and send them out into the world.</p>
        </div>
        <div className="editor">
          <div className="studio-panel-heading"><span className="studio-step">01</span><h3>{editingNumber ? "Edit your piece" : "Write your piece"}</h3></div>
          <fieldset>
            <legend>What are you writing?</legend>
            <div className="entry-type-options">{(["Poem", "Prose", "Note"] as const).map((option) => <button key={option} aria-pressed={category === option} className={category === option ? "selected" : ""} onClick={() => setCategory(option)}>{option}</button>)}</div>
          </fieldset>
          <CollectionPicker names={savedCollectionNames} value={collection} creatingNew={creatingCollection} onChange={updateCollection} autoFocusNew={!editOpen} onDelete={canDeleteCollection ? () => void removeEmptyCollection() : undefined} deleting={deletingCollection !== null} disabled={sharing} status={collectionStatus} />
          <label>Archive visibility<select value={isPublic ? "public" : "hidden"} onChange={(event) => setIsPublic(event.target.value === "public")}><option value="public">Public — visible in the archive</option><option value="hidden">Hidden — owner only</option></select></label>
          <div className="studio-fields">
            <label>Your name<input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={40} /></label>
            <label>{category} title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={48} /></label>
          </div>
          <FontPicker value={fontFamily} onChange={setFontFamily} />
          <PoemSizeControl value={poemTextSize} onChange={setPoemTextSize} />
          <label className="studio-body-label">Your {category.toLowerCase()}<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={360} rows={9} style={{ fontFamily: font.family, fontSize: `${Math.max(16, 21 * poemScale)}px` }} /><span>{body.length} / 360 characters</span></label>
        </div>
        <div className="studio-preview-panel">
          <div className="studio-panel-heading"><span className="studio-step">02</span><h3>Set the mood</h3><span className="preview-size">1080 × 1080</span></div>
          <div className="card-preview" style={{ backgroundColor: theme.background, color: theme.ink, borderColor: theme.accent }}>
            {cardImage && <img className="card-preview-image" src={cardImage} alt="" />}
            <CardShadow value={shadowOverlay} />
            <div className="preview-inner" style={{ borderColor: theme.accent }}>
              <span style={{ color: theme.accent }}>A {category.toUpperCase()} BY</span>
              <h3 style={{ fontFamily: font.family, fontWeight: 600 }}>{title || "Untitled"}</h3>
              <p style={{ fontFamily: font.family, fontSize: `clamp(${12 * poemScale}px, ${4.4 * poemScale}cqw, ${21 * poemScale}px)` }}>{body || "Your words will appear here."}</p>
              <footer><i style={{ background: theme.accent }} />{author || "Anonymous"}</footer>
            </div>
          </div>
          <fieldset className="studio-palette">
            <legend>Card palette</legend>
            <p className="palette-help">Choose a background and matching text colors.</p>
            <label className="image-upload-button">Upload a transparent image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImageFile(file).then(setCardImage); }} /></label>
            <div className="theme-options">{themes.map((option, index) => <button className={activeTheme === index ? "active" : ""} key={option.name} onClick={() => setActiveTheme(index)} style={activeTheme === index ? { backgroundColor: option.background, color: option.ink, borderColor: option.accent } : undefined} aria-label={"Use " + option.name + " palette"} aria-pressed={activeTheme === index}><span className="palette-swatches" aria-hidden="true"><i style={{ background: option.background }} /><i style={{ background: option.ink }} /><i style={{ background: option.accent }} /></span>{option.name}<span aria-hidden="true">{activeTheme === index ? "✓" : ""}</span></button>)}</div>
          </fieldset>
          <ShadowPicker value={shadowOverlay} onChange={setShadowOverlay} />
          <div className="studio-share-area">
            <button className="share-button" onClick={() => void sharePoem()} disabled={sharing || deletingCollection !== null || !body.trim() || !collectionValid || preparedCard?.draft !== cardDraft}><InstagramIcon />{sharing ? "Sharing…" : editingNumber ? "Update archive" : "Share to Instagram"}<ArrowIcon /></button>
            <p>Sharing saves to your archive and downloads an image.</p>
            <small>Opens Instagram in a new tab. Create a post and select the downloaded image.</small>
            {shareStatus && <p className="studio-share-feedback" role="status">{shareStatus}</p>}
          </div>
        </div>
        <section className="archive-settings-card" aria-labelledby="archive-settings-heading">
          <div className="studio-panel-heading"><span className="studio-step">03</span><h3 id="archive-settings-heading">Archive settings</h3></div>
          <p className="archive-settings-intro">Manage your archive details and poet profile.</p>
          <div className="archive-settings-fields">
            <div className="archive-setting-field"><label>Archive volume<input type="number" min="1" max="9999" step="1" inputMode="numeric" value={archiveVolume} onChange={(event) => setArchiveVolume(event.target.value)} aria-invalid={!volumeValid} aria-describedby="archive-volume-help" /></label><small id="archive-volume-help">Shown as “Personal archive · VOL {volumeLabel}” in Quiet hours.</small></div>
            <label>Poet name<input value={poetName} onChange={(event) => setPoetName(event.target.value)} maxLength={40} /></label>
            <label>Poet quote<textarea value={poetQuote} onChange={(event) => setPoetQuote(event.target.value)} maxLength={180} rows={4} /></label>
            <label>Poet biography<textarea value={poetBio} onChange={(event) => setPoetBio(event.target.value)} maxLength={360} rows={4} /></label>
            <div className="profile-controls"><label>Poet quote size<input type="range" min="70" max="150" value={poetTextSize} onChange={(event) => setPoetTextSize(Number(event.target.value))} aria-valuetext={`${poetTextSize} percent`} /><span aria-hidden="true">{poetTextSize}%</span></label><label>Quote color<input type="color" value={poetTextColor} onChange={(event) => setPoetTextColor(event.target.value)} /></label></div>
          </div>
          <button className="profile-save-button" onClick={() => void savePoetProfile()} disabled={profileSaving || !volumeValid}>{profileSaving ? "Saving…" : "Save archive settings"}</button>
          {profileStatus && <p className="studio-share-feedback" role="status">{profileStatus}</p>}
        </section>
      </section>}

      <ArchiveDialog open={deleteCandidate !== null} onClose={() => setDeleteCandidate(null)} closeLabel="Close delete confirmation" ariaLabel="Delete this piece?" className="delete-modal">
        <p className="eyebrow">Permanent action</p>
        <h2>Delete this piece?</h2>
        <p className="delete-modal-copy">“{deleteCandidate?.title}” will be removed from the archive. This cannot be undone.</p>
        <div className="delete-modal-actions"><button className="delete-cancel-button" onClick={() => setDeleteCandidate(null)}>Keep piece</button><button className="delete-confirm-button" onClick={() => { if (!deleteCandidate) return; const entry = deleteCandidate; setDeleteCandidate(null); void removeArchiveEntry(entry); }}>Delete permanently</button></div>
      </ArchiveDialog>
      <footer className="site-footer">
        <a className="wordmark" href="#top"><span className="archive-name">Mikhai: A Personal Archive</span></a>
        <p>Made for words worth keeping.</p>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
