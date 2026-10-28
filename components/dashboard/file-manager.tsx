'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  Download,
  FolderInput,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  LayoutList,
  Menu as MenuIcon,
  MoreHorizontal,
  PanelRight,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, ApiError, type SessionInfo, type SystemInfo } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { kindFromName, matchesCategory, type MediaCategory } from '@/lib/file-types';
import { formatBytes } from '@/lib/format';
import { useLibrary, folderTree, type LibraryView } from '@/lib/use-library';
import { useUploadQueue } from '@/lib/use-uploads';
import type { StoredFile } from '@/lib/types';
import {
  Badge,
  Button,
  ContextMenuPortal,
  IconButton,
  Kbd,
  Menu,
  type MenuItem,
} from '@/components/ui';
import { useTheme } from '@/components/theme';
import { useToast } from '@/components/toast';
import { INTERNAL_FILE_MIME, Sidebar } from './sidebar';
import { FileCard, FileRow, type FileActionHandlers } from './file-item';
import { FolderCard } from './folder-item';
import { UploadPanel } from './upload-panel';
import { PreviewModal } from './preview-modal';
import { CommandPalette } from './command-palette';
import { InspectorPanel } from './inspector-panel';
import {
  ConfirmDialog,
  MoveDialog,
  PromptDialog,
  SettingsDialog,
} from './dialogs';

type SortKey = 'date' | 'name' | 'size';
type SortDir = 'asc' | 'desc';

type Props = {
  username: string | null;
  runtime: SessionInfo['runtime'];
};

const VIEW_LABELS: Record<LibraryView, string> = {
  all: 'All files',
  recent: 'Recent',
  starred: 'Starred',
  archive: 'Archive',
  images: 'Images',
  videos: 'Videos',
  audio: 'Audio',
  documents: 'Documents',
  code: 'Code',
  archives: 'Archives',
};

const MEDIA_VIEWS = new Set<string>([
  'images',
  'videos',
  'audio',
  'documents',
  'code',
  'archives',
]);

export function FileManager({ username, runtime }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const library = useLibrary();

  const [view, setView] = useState<LibraryView>('all');
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [archivedFiles, setArchivedFiles] = useState<StoredFile[]>([]);
  const [shares, setShares] = useState<Awaited<ReturnType<typeof api.shares>>>([]);
  const [shareBusy, setShareBusy] = useState(false);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    ok: boolean;
    detail: string;
    botCount: number;
  } | null>(null);
  const [connectionChecking, setConnectionChecking] = useState(false);
  const [draggingExternal, setDraggingExternal] = useState(false);
  const [crumbDropTarget, setCrumbDropTarget] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    title?: string;
    items: MenuItem[];
  } | null>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    type: 'file' | 'folder';
    value: string;
  } | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoredFile[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: 'file'; file: StoredFile }
    | { type: 'folder'; path: string; files: number; bytes: number }
    | { type: 'selection'; files: StoredFile[] }
    | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  /* ------------------------------ derived data ----------------------------- */

  const folderNodes = useMemo(
    () => folderTree(library.files, library.folders),
    [library.files, library.folders],
  );

  const childFolders = useMemo(
    () => folderNodes.filter((node) => node.parent === folder),
    [folderNodes, folder],
  );

  const starredCount = useMemo(
    () => library.files.filter((file) => file.starred).length,
    [library.files],
  );

  const baseFiles = useMemo(() => {
    const search = debouncedQuery.trim().toLowerCase();

    if (view === 'archive') {
      let list = [...archivedFiles].sort(
        (a, b) => (b.deletedAt || 0) - (a.deletedAt || 0),
      );
      if (search) {
        list = list.filter(
          (file) =>
            file.name.toLowerCase().includes(search) ||
            file.folder.toLowerCase().includes(search),
        );
      }
      return list;
    }

    if (search) {
      return library.files.filter(
        (file) =>
          file.name.toLowerCase().includes(search) ||
          file.folder.toLowerCase().includes(search),
      );
    }
    if (view === 'starred') return library.files.filter((file) => file.starred);
    if (view === 'recent') {
      return [...library.files].sort((a, b) => b.createdAt - a.createdAt);
    }
    if (MEDIA_VIEWS.has(view)) {
      return library.files.filter((file) =>
        matchesCategory(kindFromName(file.name, file.mime), view as MediaCategory),
      );
    }
    return library.files.filter((file) => file.folder === folder);
  }, [debouncedQuery, folder, library.files, view]);

  const visibleFiles = useMemo(() => {
    const files = [...baseFiles];
    const factor = sortDir === 'asc' ? 1 : -1;
    switch (sort) {
      case 'name':
        return files.sort((a, b) => factor * a.name.localeCompare(b.name));
      case 'size':
        return files.sort((a, b) => factor * (a.size - b.size));
      case 'date':
      default:
        return files.sort((a, b) => factor * (a.createdAt - b.createdAt));
    }
  }, [baseFiles, sort, sortDir]);

  const visibleBytes = useMemo(
    () => visibleFiles.reduce((sum, file) => sum + file.size, 0),
    [visibleFiles],
  );

  const breadcrumbs = useMemo(() => {
    const segments = folder.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      label: segment,
      path: segments.slice(0, index + 1).join('/'),
    }));
  }, [folder]);

  const title = debouncedQuery
    ? `Results for “${debouncedQuery}”`
    : view !== 'all'
      ? VIEW_LABELS[view]
      : breadcrumbs.length > 0
        ? breadcrumbs[breadcrumbs.length - 1].label
        : 'Drive';

  const showFolders = view === 'all' && !debouncedQuery && childFolders.length > 0;
  const showFolderBadge = view !== 'all' || Boolean(debouncedQuery);

  const inspectedFile = useMemo(() => {
    if (inspectedId) {
      const found = library.files.find((f) => f.id === inspectedId);
      if (found) return found;
    }
    if (selection.size === 1) {
      const onlyId = [...selection][0];
      return library.files.find((f) => f.id === onlyId) ?? null;
    }
    return null;
  }, [inspectedId, library.files, selection]);

  const currentShare = useMemo(() => {
    if (!inspectedFile) return null;
    return shares.find((entry) => entry.file.id === inspectedFile.id) ?? null;
  }, [inspectedFile, shares]);

  const handleCreateShare = async (expiresAt?: number) => {
    if (!inspectedFile) return;
    setShareBusy(true);
    try {
      await api.createShare(inspectedFile.id, { expiresAt });
      const updated = await api.shares();
      setShares(updated);
      toast.success('Share link created');
    } catch (error) {
      toast.error('Could not create share link', (error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  const handleRevokeShare = async (token: string) => {
    setShareBusy(true);
    try {
      await api.revokeShare(token);
      setShares(shares.filter((entry) => entry.share.token !== token));
      toast.success('Share link revoked');
    } catch (error) {
      toast.error('Could not revoke link', (error as Error).message);
    } finally {
      setShareBusy(false);
    }
  };

  /* -------------------------------- uploads -------------------------------- */

  const handleUploaded = useCallback(
    (file: StoredFile) => {
      library.upsertFile(file);
      toast.success(`Uploaded ${file.name}`, formatBytes(file.size));
    },
    [library, toast],
  );

  const handleUploadError = useCallback(
    (message: string) => {
      toast.error('Upload failed', message);
    },
    [toast],
  );

  const uploads = useUploadQueue({
    chunkSize: runtime.chunkSize,
    onUploaded: handleUploaded,
    onError: handleUploadError,
    maxConcurrent: Math.min(6, runtime.botCount * 2 || 6),
    chunkConcurrency: Math.min(8, runtime.botCount * 4 || 8),
  });

  // Load the Archive when the user opens it.
  useEffect(() => {
    if (view === 'archive') {
      void api.listArchived().then((data) => setArchivedFiles(data.files));
    }
  }, [view]);

  // Load public share links so the inspector can show/revoke them.
  useEffect(() => {
    void api.shares().then(setShares).catch(() => undefined);
  }, []);

  // Check storage connection on mount so the user sees immediately if bots
  // are offline / Telegram isn't configured (uploads would fail, files go "not found").
  const checkConnection = useCallback(async () => {
    setConnectionChecking(true);
    try {
      const sys = await api.system();
      setSystem(sys);
      setConnectionStatus({
        ok: sys.connection.ok,
        detail: sys.connection.detail,
        botCount: runtime.botCount,
      });
    } catch {
      setConnectionStatus({
        ok: false,
        detail: 'Could not reach the server to check storage connection.',
        botCount: runtime.botCount,
      });
    } finally {
      setConnectionChecking(false);
    }
  }, [runtime.botCount]);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  const targetUploadFolder = view === 'all' ? folder : '';

  const addFiles = useCallback(
    (files: File[] | FileList) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      uploads.addFiles(list, targetUploadFolder);
      toast.info(
        `Uploading ${list.length} ${list.length === 1 ? 'file' : 'files'}`,
        `/${targetUploadFolder}`,
      );
    },
    [targetUploadFolder, toast, uploads],
  );

  /* ------------------------------ interactions ----------------------------- */

  const navigateFolder = useCallback((path: string) => {
    setView('all');
    setFolder(path);
    setQuery('');
    setDebouncedQuery('');
    setSelection(new Set());
    setSidebarOpen(false);
  }, []);

  const navigateView = useCallback((next: LibraryView) => {
    setView(next);
    setQuery('');
    setDebouncedQuery('');
    setSelection(new Set());
    if (next === 'all') setFolder('');
    setSidebarOpen(false);
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sort === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const download = useCallback(
    (file: StoredFile, silentToast = false) => {
      if (!silentToast) {
        toast.info(`Downloading ${file.name}`, formatBytes(file.size));
      }
      const link = document.createElement('a');
      link.href = api.downloadUrl(file.id);
      link.download = file.name;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [toast],
  );

  const toggleStar = useCallback(
    async (file: StoredFile) => {
      const nextStarred = !file.starred;
      const previous = library.snapshot();
      library.patchFileLocal(file.id, { starred: nextStarred });
      try {
        const { file: updated } = await api.patchFile(file.id, { starred: nextStarred });
        library.upsertFile(updated);
      } catch (error) {
        library.restore(previous);
        toast.error('Could not update star', (error as Error).message);
      }
    },
    [library, toast],
  );

  const toggleSelect = useCallback((file: StoredFile) => {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  }, []);

  const ensureNoDialog = () => {
    setDialogError(null);
    setBusy(false);
  };

  const moveFilesBatch = useCallback(
    async (fileIds: string[], targetPath: string) => {
      const candidates = library.files.filter(
        (file) => fileIds.includes(file.id) && file.folder !== targetPath,
      );
      if (candidates.length === 0) return;

      const previous = library.snapshot();
      for (const item of candidates) {
        library.patchFileLocal(item.id, { folder: targetPath });
      }
      setMoveTarget(null);
      setSelection(new Set());
      toast.success(
        candidates.length === 1
          ? `Moved ${candidates[0].name}`
          : `Moved ${candidates.length} files`,
        `/${targetPath}`,
      );

      try {
        const results = await Promise.all(
          candidates.map((item) => api.patchFile(item.id, { folder: targetPath })),
        );
        results.forEach(({ file }) => library.upsertFile(file));
      } catch (error) {
        library.restore(previous);
        toast.error('Could not move files', (error as Error).message);
      }
    },
    [library, toast],
  );

  const createFolder = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const baseParent = view === 'all' ? folder : '';
    const optimisticPath = baseParent ? `${baseParent}/${trimmed}` : trimmed;
    const exists = folderNodes.some(
      (node) => node.path.toLowerCase() === optimisticPath.toLowerCase(),
    );
    if (exists) {
      setDialogError('A folder with that name already exists.');
      return;
    }

    const previous = library.snapshot();
    const previousFolder = folder;
    library.addFolderLocal(optimisticPath);
    setNewFolderOpen(false);
    navigateFolder(optimisticPath);
    toast.success('Folder created', `/${optimisticPath}`);

    try {
      const result = await api.createFolder(baseParent, trimmed);
      if (result.path !== optimisticPath) {
        library.renameFolderLocal(optimisticPath, result.path);
        setFolder(result.path);
      }
    } catch (error) {
      library.restore(previous);
      setFolder(previousFolder);
      toast.error(
        'Could not create folder',
        error instanceof ApiError ? error.message : 'Unexpected error.',
      );
    }
  };

  const renameFile = async (name: string) => {
    if (!renameTarget || renameTarget.type !== 'file') return;
    const id = renameTarget.value;
    const previous = library.snapshot();
    library.patchFileLocal(id, { name });
    setRenameTarget(null);
    toast.success('File renamed', name);

    try {
      const { file: updated } = await api.patchFile(id, { name });
      library.upsertFile(updated);
    } catch (error) {
      library.restore(previous);
      toast.error(
        'Could not rename file',
        error instanceof ApiError ? error.message : 'Unexpected error.',
      );
    }
  };

  const renameFolder = async (name: string) => {
    if (!renameTarget || renameTarget.type !== 'folder') return;
    const oldPath = renameTarget.value;
    const segments = oldPath.split('/');
    const parent = segments.slice(0, -1).join('/');
    const targetPath = parent ? `${parent}/${name}` : name;

    if (
      oldPath.toLowerCase() !== targetPath.toLowerCase() &&
      folderNodes.some((node) => node.path.toLowerCase() === targetPath.toLowerCase())
    ) {
      setDialogError('A folder with that name already exists.');
      return;
    }

    const previous = library.snapshot();
    const previousActiveFolder = folder;
    library.renameFolderLocal(oldPath, targetPath);
    setRenameTarget(null);
    if (folder === oldPath || folder.startsWith(`${oldPath}/`)) {
      setFolder(targetPath + folder.slice(oldPath.length));
    }
    toast.success('Folder renamed', `/${targetPath}`);

    try {
      const result = await api.renameFolder(oldPath, name);
      if (result.path !== targetPath) {
        library.renameFolderLocal(targetPath, result.path);
      }
    } catch (error) {
      library.restore(previous);
      setFolder(previousActiveFolder);
      toast.error(
        'Could not rename folder',
        error instanceof ApiError ? error.message : 'Unexpected error.',
      );
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const previous = library.snapshot();
    const forever = view === 'archive';
    setDeleteTarget(null);

    try {
      if (target.type === 'file') {
        library.removeFilesLocal([target.file.id]);
        if (inspectedId === target.file.id) setInspectedId(null);
        toast.success(forever ? 'Deleted forever' : 'Moved to Archive', target.file.name);
        if (forever) {
          await api.deleteFile(target.file.id, { purge: true });
        } else {
          await api.deleteFile(target.file.id);
        }
      } else if (target.type === 'selection') {
        const ids = target.files.map((file) => file.id);
        library.removeFilesLocal(ids);
        setSelection(new Set());
        toast.success(
          forever
            ? `Deleted ${target.files.length} files forever`
            : `Moved ${target.files.length} files to Archive`,
          formatBytes(target.files.reduce((sum, file) => sum + file.size, 0)),
        );
        if (forever) {
          await api.deleteFiles(ids, { purge: true });
        } else {
          await api.deleteFiles(ids);
        }
      } else {
        const previousActiveFolder = folder;
        library.removeFolderLocal(target.path);
        if (folder === target.path || folder.startsWith(`${target.path}/`)) {
          const parent = target.path.split('/').slice(0, -1).join('/');
          setFolder(parent);
        }
        toast.success('Deleted folder', `${target.files} files moved to Archive`);
        try {
          await api.deleteFolder(target.path);
        } catch (err) {
          setFolder(previousActiveFolder);
          throw err;
        }
      }
    } catch (error) {
      library.restore(previous);
      toast.error('Delete failed', (error as Error).message);
    }
  };

  const restoreFile = async (file: StoredFile) => {
    const previous = library.snapshot();
    library.patchFileLocal(file.id, { archived: false });
    setArchivedFiles((current) => current.filter((item) => item.id !== file.id));
    toast.success('Restored', file.name);

    try {
      const { file: updated } = await api.patchFile(file.id, { archived: false });
      library.upsertFile(updated);
      setArchivedFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error) {
      library.restore(previous);
      void api.listArchived().then((data) => setArchivedFiles(data.files));
      toast.error('Could not restore file', (error as Error).message);
    }
  };

  const restoreSelection = async () => {
    const files = selectedFiles;
    if (files.length === 0) return;
    const previous = library.snapshot();
    for (const item of files) library.patchFileLocal(item.id, { archived: false });
    setSelection(new Set());
    setArchivedFiles((current) => current.filter((item) => !files.some((f) => f.id === item.id)));
    toast.success(`Restored ${files.length} files`);

    try {
      await Promise.all(files.map((item) => api.patchFile(item.id, { archived: false })));
    } catch (error) {
      library.restore(previous);
      void api.listArchived().then((data) => setArchivedFiles(data.files));
      toast.error('Could not restore files', (error as Error).message);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  const openSettings = useCallback(async () => {
    setSettingsOpen(true);
    try {
      setSystem(await api.system());
    } catch (error) {
      toast.error('Could not load system info', (error as Error).message);
    }
  }, [toast]);

  const openContextMenu = useCallback(
    (event: React.MouseEvent, items: MenuItem[], menuTitle?: string) => {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        title: menuTitle,
        items,
      });
    },
    [],
  );

  /* -------------------------------- effects -------------------------------- */

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 120);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    try {
      const storedLayout = window.localStorage.getItem('tellynas-layout');
      if (storedLayout === 'list' || storedLayout === 'grid') setLayout(storedLayout);
      const storedSort = window.localStorage.getItem('tellynas-sort') as SortKey | null;
      if (storedSort && ['date', 'name', 'size'].includes(storedSort)) setSort(storedSort);
      const storedInspector = window.localStorage.getItem('tellynas-inspector');
      if (storedInspector === '1') setInspectorOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('tellynas-layout', layout);
      window.localStorage.setItem('tellynas-sort', sort);
      window.localStorage.setItem('tellynas-inspector', inspectorOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [layout, sort, inspectorOpen]);

  const selectedFiles = useMemo(
    () => library.files.filter((file) => selection.has(file.id)),
    [library.files, selection],
  );

  // Global keyboard shortcuts & clipboard paste upload
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }

      if (typing) return;

      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'Escape') {
        setContextMenu(null);
        if (previewId) setPreviewId(null);
        else if (selection.size > 0) setSelection(new Set());
      } else if (
        (event.key === 'u' || event.key === 'U') &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        fileInputRef.current?.click();
      } else if (
        (event.key === 'n' || event.key === 'N') &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        ensureNoDialog();
        setNewFolderOpen(true);
      } else if (
        (event.key === 'i' || event.key === 'I') &&
        !event.metaKey &&
        !event.ctrlKey
      ) {
        event.preventDefault();
        setInspectorOpen((v) => !v);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        if (visibleFiles.length > 0) {
          event.preventDefault();
          setSelection(new Set(visibleFiles.map((f) => f.id)));
        }
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedFiles.length > 0
      ) {
        event.preventDefault();
        ensureNoDialog();
        setDeleteTarget({ type: 'selection', files: selectedFiles });
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      const pasted = event.clipboardData?.files;
      if (pasted && pasted.length > 0) {
        event.preventDefault();
        addFiles(pasted);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('paste', onPaste);
    };
  }, [addFiles, previewId, selectedFiles, selection.size, visibleFiles]);

  /* -------------------------------- handlers ------------------------------- */

  const handlers: FileActionHandlers = {
    onOpen: (file) => setPreviewId(file.id),
    onInspect: (file) => {
      setInspectedId(file.id);
      setInspectorOpen(true);
    },
    onDownload: (file) => download(file),
    onToggleStar: toggleStar,
    onRename: (file) => {
      ensureNoDialog();
      setRenameTarget({ type: 'file', value: file.id });
    },
    onMove: (file) => {
      ensureNoDialog();
      setMoveTarget([file]);
    },
    onDelete: (file) => {
      ensureNoDialog();
      setDeleteTarget({ type: 'file', file });
    },
    onRestore: restoreFile,
    onToggleSelect: toggleSelect,
    onNavigateFolder: navigateFolder,
    onContextMenu: openContextMenu,
  };

  const previewIndex = visibleFiles.findIndex((file) => file.id === previewId);
  const previewFile =
    previewIndex >= 0
      ? visibleFiles[previewIndex]
      : library.files.find((file) => file.id === previewId) ?? null;

  const navigatePreview = (direction: -1 | 1) => {
    if (visibleFiles.length < 2 || previewIndex < 0) return;
    const nextIndex =
      (previewIndex + direction + visibleFiles.length) % visibleFiles.length;
    setPreviewId(visibleFiles[nextIndex].id);
  };

  const folderOptions = useMemo(
    () => folderNodes.map((node) => node.path),
    [folderNodes],
  );

  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((file) => selection.has(file.id));

  const handleBreadcrumbDrop = (event: React.DragEvent, targetPath: string) => {
    if (!event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    setCrumbDropTarget(null);
    try {
      const ids = JSON.parse(event.dataTransfer.getData(INTERNAL_FILE_MIME)) as string[];
      if (Array.isArray(ids) && ids.length > 0) {
        void moveFilesBatch(ids, targetPath);
      }
    } catch {
      /* ignore */
    }
  };

  const canvasContextItems = useMemo<MenuItem[]>(
    () => [
      {
        label: 'Upload files…',
        icon: <Upload className="size-3.5" />,
        shortcut: 'U',
        onSelect: () => fileInputRef.current?.click(),
      },
      {
        label: 'New folder…',
        icon: <FolderPlus className="size-3.5" />,
        shortcut: 'N',
        onSelect: () => {
          ensureNoDialog();
          setNewFolderOpen(true);
        },
      },
      {
        label: 'Select all',
        icon: <CheckSquare className="size-3.5" />,
        shortcut: '⌘A',
        disabled: visibleFiles.length === 0,
        dividerBefore: true,
        onSelect: () => setSelection(new Set(visibleFiles.map((f) => f.id))),
      },
      {
        label: layout === 'grid' ? 'Switch to List view' : 'Switch to Grid view',
        icon:
          layout === 'grid' ? (
            <LayoutList className="size-3.5" />
          ) : (
            <LayoutGrid className="size-3.5" />
          ),
        onSelect: () => setLayout((v) => (v === 'grid' ? 'list' : 'grid')),
      },
      {
        label: 'Refresh library',
        icon: <RefreshCw className="size-3.5" />,
        dividerBefore: true,
        onSelect: () => void library.refresh(),
      },
    ],
    [layout, library, visibleFiles],
  );

  const deleteDetails = useMemo(() => {
    if (!deleteTarget) return null;
    if (deleteTarget.type === 'file') {
      return (
        <div className="space-y-1 rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px]">
          <p className="truncate font-medium text-fg">{deleteTarget.file.name}</p>
          <p className="font-mono text-[11.5px] text-muted">
            {formatBytes(deleteTarget.file.size)}
          </p>
        </div>
      );
    }
    if (deleteTarget.type === 'selection') {
      return (
        <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px] text-muted">
          <p className="font-medium text-fg">{deleteTarget.files.length} selected files</p>
          <p className="mt-0.5 font-mono text-[11.5px]">
            {formatBytes(deleteTarget.files.reduce((sum, file) => sum + file.size, 0))} will be
            permanently deleted.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px] text-muted">
        <p className="font-medium text-fg">/{deleteTarget.path}</p>
        <p className="mt-0.5 font-mono text-[11.5px]">
          {deleteTarget.files} files · {formatBytes(deleteTarget.bytes)} will be removed.
        </p>
      </div>
    );
  }, [deleteTarget]);

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sort !== column) return null;
    return sortDir === 'asc' ? (
      <ArrowUp className="size-3 text-fg" />
    ) : (
      <ArrowDown className="size-3 text-fg" />
    );
  };

  /* --------------------------------- render -------------------------------- */

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar
          view={view}
          folder={folder}
          files={library.files}
          folders={folderNodes}
          stats={library.stats}
          starredCount={starredCount}
          archivedCount={archivedFiles.length}
          demo={runtime.demo}
          username={username}
          onNavigateView={navigateView}
          onNavigateFolder={navigateFolder}
          onUploadClick={() => fileInputRef.current?.click()}
          onNewFolder={() => {
            ensureNoDialog();
            setNewFolderOpen(true);
          }}
          onOpenCommand={() => setCommandOpen(true)}
          onOpenSettings={() => void openSettings()}
          onDropFilesToFolder={(ids, targetPath) => void moveFilesBatch(ids, targetPath)}
        />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="animate-slide-up absolute inset-y-0 left-0">
            <Sidebar
              view={view}
              folder={folder}
              files={library.files}
              folders={folderNodes}
              stats={library.stats}
              starredCount={starredCount}
              archivedCount={archivedFiles.length}
              demo={runtime.demo}
              username={username}
              onNavigateView={navigateView}
              onNavigateFolder={navigateFolder}
              onUploadClick={() => fileInputRef.current?.click()}
              onNewFolder={() => {
                ensureNoDialog();
                setNewFolderOpen(true);
              }}
              onOpenCommand={() => setCommandOpen(true)}
              onOpenSettings={() => void openSettings()}
              onDropFilesToFolder={(ids, targetPath) => void moveFilesBatch(ids, targetPath)}
              onCloseMobile={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Center workspace column */}
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
          if (!event.dataTransfer?.types.includes('Files')) return;
          dragDepth.current += 1;
          setDraggingExternal(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
          if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
        }}
        onDragLeave={(event) => {
          if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDraggingExternal(false);
        }}
        onDrop={(event) => {
          if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDraggingExternal(false);
          if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
        }}
      >

        {/* Connection status banner */}
        {(connectionStatus !== null && !connectionStatus.ok) || connectionChecking ? (
          <div className="px-3.5 py-2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]',
                connectionStatus
                  ? 'border-danger/25 bg-danger-soft text-danger'
                  : 'border-line-strong bg-surface-2/50 text-muted',
              )}
            >
              {connectionChecking ? (
                <>
                  <RefreshCw className="size-3.5 shrink-0 animate-spin" />
                  <span>Checking storage connection…</span>
                </>
              ) : connectionStatus?.ok === false ? (
                <>
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span className="flex-1 min-w-0">
                    {connectionStatus.detail}
                    {connectionStatus.botCount === 0 && (
                      <span className="block mt-0.5 font-mono text-[11px]">
                        No Telegram bots configured — uploads go to temporary demo
                        storage and will be lost on redeploy. Add
                        TELEGRAM_BOT_TOKEN(S) and TELEGRAM_CHAT_ID in .env.local.
                      </span>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={checkConnection}
                    disabled={connectionChecking}
                  >
                    Retry
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Top bar */}
        <header className="z-20 flex h-13 shrink-0 items-center justify-between gap-2 border-b border-line bg-bg/85 px-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <IconButton
              label="Open navigation"
              className="mr-1 lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <MenuIcon className="size-4.5" />
            </IconButton>

            {/* Breadcrumbs */}
            <button
              type="button"
              onClick={() => navigateFolder('')}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) {
                  event.preventDefault();
                  setCrumbDropTarget('__root__');
                }
              }}
              onDragLeave={() => {
                if (crumbDropTarget === '__root__') setCrumbDropTarget(null);
              }}
              onDrop={(event) => handleBreadcrumbDrop(event, '')}
              className={cn(
                'rounded-md px-2 py-1 text-[13px] font-medium transition-colors',
                view === 'all' && breadcrumbs.length === 0 && !debouncedQuery
                  ? 'text-fg'
                  : 'text-muted hover:bg-surface-2 hover:text-fg',
                crumbDropTarget === '__root__' && 'bg-accent-soft text-accent ring-1 ring-accent',
              )}
            >
              Drive
            </button>

            {view !== 'all' && !debouncedQuery && (
              <span className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted/60" />
                <span className="rounded-md px-2 py-1 text-[13px] font-medium text-fg">
                  {VIEW_LABELS[view]}
                </span>
              </span>
            )}

            {view === 'all' &&
              breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                const isDropping = crumbDropTarget === crumb.path;
                return (
                  <span key={crumb.path} className="flex min-w-0 items-center gap-1">
                    <ChevronRight className="size-3.5 shrink-0 text-muted/50" />
                    <button
                      type="button"
                      onClick={() => navigateFolder(crumb.path)}
                      onDragOver={(event) => {
                        if (event.dataTransfer.types.includes(INTERNAL_FILE_MIME)) {
                          event.preventDefault();
                          setCrumbDropTarget(crumb.path);
                        }
                      }}
                      onDragLeave={() => {
                        if (crumbDropTarget === crumb.path) setCrumbDropTarget(null);
                      }}
                      onDrop={(event) => handleBreadcrumbDrop(event, crumb.path)}
                      className={cn(
                        'max-w-[150px] truncate rounded-md px-2 py-1 text-[13px] transition-colors',
                        isLast && !debouncedQuery
                          ? 'font-medium text-fg'
                          : 'text-muted hover:bg-surface-2 hover:text-fg',
                        isDropping && 'bg-accent-soft text-accent ring-1 ring-accent',
                      )}
                    >
                      {crumb.label}
                    </button>
                  </span>
                );
              })}

            {library.refreshing && (
              <span className="ml-2 hidden items-center gap-1 font-mono text-[11px] text-muted sm:inline-flex">
                <RefreshCw className="size-3 animate-spin" /> syncing
              </span>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5">
            <div className="relative w-36 sm:w-56">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter files…"
                aria-label="Filter files"
                className="h-8 w-full rounded-lg border border-line bg-surface pr-7 pl-8 text-[12.5px] text-fg transition outline-none placeholder:text-muted/70 focus:border-line-strong focus:ring-2 focus:ring-fg/10"
              />
              {query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <span className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 sm:inline-flex">
                  <Kbd>/</Kbd>
                </span>
              )}
            </div>

            {/* View mode toggle */}
            <div className="hidden items-center rounded-lg border border-line bg-surface p-0.5 sm:flex">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={layout === 'grid'}
                onClick={() => setLayout('grid')}
                className={cn(
                  'rounded-md p-1 transition',
                  layout === 'grid'
                    ? 'bg-surface-2 text-fg shadow-2xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={layout === 'list'}
                onClick={() => setLayout('list')}
                className={cn(
                  'rounded-md p-1 transition',
                  layout === 'list'
                    ? 'bg-surface-2 text-fg shadow-2xs'
                    : 'text-muted hover:text-fg',
                )}
              >
                <LayoutList className="size-3.5" />
              </button>
            </div>

            {/* Sort menu */}
            <Menu
              label="Sort files"
              trigger={<SlidersHorizontal className="size-3.5" />}
              className="size-8 rounded-lg border border-line bg-surface"
              items={[
                {
                  label: 'Date uploaded',
                  icon: <CalendarClock className="size-3.5" />,
                  shortcut: sort === 'date' ? (sortDir === 'desc' ? '↓' : '↑') : undefined,
                  onSelect: () => toggleSort('date'),
                },
                {
                  label: 'File name',
                  icon: <ArrowDownAZ className="size-3.5" />,
                  shortcut: sort === 'name' ? (sortDir === 'asc' ? 'A–Z' : 'Z–A') : undefined,
                  onSelect: () => toggleSort('name'),
                },
                {
                  label: 'File size',
                  icon: <ArrowUpDown className="size-3.5" />,
                  shortcut: sort === 'size' ? (sortDir === 'desc' ? '↓' : '↑') : undefined,
                  onSelect: () => toggleSort('size'),
                },
              ]}
            />

            <IconButton
              label="Toggle details inspector (I)"
              active={inspectorOpen}
              onClick={() => setInspectorOpen((v) => !v)}
              className="border border-line bg-surface"
            >
              <PanelRight className="size-3.5" />
            </IconButton>

            <Button
              variant="primary"
              size="sm"
              className="h-8 lg:hidden"
              icon={<Upload className="size-3.5" />}
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="hidden sm:inline">Upload</span>
            </Button>
          </div>
        </header>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        {/* Scrollable drive canvas */}
        <main
          className="min-h-0 flex-1 overflow-y-auto"
          onContextMenu={(event) => {
            event.preventDefault();
            openContextMenu(event, canvasContextItems, `/${folder || ''}`);
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && selection.size > 0) {
              setSelection(new Set());
            }
          }}
        >
          <div className="mx-auto w-full max-w-[1440px] px-3.5 pt-4 pb-28 sm:px-6">
            {/* Subheader */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4">
              <div className="flex items-baseline gap-2.5">
                <h1 className="text-[18px] font-semibold tracking-tight text-fg">{title}</h1>
                <span className="font-mono text-[11.5px] text-muted tabular-nums">
                  {visibleFiles.length} {visibleFiles.length === 1 ? 'file' : 'files'}
                  {visibleBytes > 0 ? ` · ${formatBytes(visibleBytes)}` : ''}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {view === 'all' && !debouncedQuery && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FolderPlus className="size-3.5" />}
                    onClick={() => {
                      ensureNoDialog();
                      setNewFolderOpen(true);
                    }}
                  >
                    New folder
                  </Button>
                )}

                {folder && view === 'all' && (
                  <Menu
                    label="Current folder options"
                    trigger={<MoreHorizontal className="size-4" />}
                    className="size-7 rounded-lg border border-line bg-surface"
                    items={[
                      {
                        label: 'Rename this folder',
                        icon: <FolderOpen className="size-3.5" />,
                        onSelect: () => {
                          ensureNoDialog();
                          setRenameTarget({ type: 'folder', value: folder });
                        },
                      },
                      {
                        label: 'Delete this folder',
                        icon: <Trash2 className="size-3.5" />,
                        danger: true,
                        dividerBefore: true,
                        onSelect: () => {
                          ensureNoDialog();
                          const scoped = library.files.filter(
                            (file) =>
                              file.folder === folder || file.folder.startsWith(`${folder}/`),
                          );
                          setDeleteTarget({
                            type: 'folder',
                            path: folder,
                            files: scoped.length,
                            bytes: scoped.reduce((sum, file) => sum + file.size, 0),
                          });
                        },
                      },
                    ]}
                  />
                )}
              </div>
            </div>

            {/* Folders section */}
            {showFolders && (
              <section className="mb-6">
                <h2 className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase">
                  Folders · {childFolders.length}
                </h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {childFolders.map((node) => (
                    <FolderCard
                      key={node.path}
                      path={node.path}
                      name={node.name}
                      count={node.totalCount}
                      totalBytes={node.totalBytes}
                      onOpen={() => navigateFolder(node.path)}
                      onRename={() => {
                        ensureNoDialog();
                        setRenameTarget({ type: 'folder', value: node.path });
                      }}
                      onDelete={() => {
                        ensureNoDialog();
                        const scoped = library.files.filter(
                          (file) =>
                            file.folder === node.path ||
                            file.folder.startsWith(`${node.path}/`),
                        );
                        setDeleteTarget({
                          type: 'folder',
                          path: node.path,
                          files: scoped.length,
                          bytes: scoped.reduce((sum, file) => sum + file.size, 0),
                        });
                      }}
                      onDropFiles={(ids, targetPath) => void moveFilesBatch(ids, targetPath)}
                      onContextMenu={openContextMenu}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Files section */}
            <section>
              {showFolders && visibleFiles.length > 0 && (
                <h2 className="mb-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase">
                  Files · {visibleFiles.length}
                </h2>
              )}

              {library.loading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {Array.from({ length: 10 }).map((_, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-xl border border-line bg-surface"
                    >
                      <div className="skeleton aspect-[16/10] w-full" />
                      <div className="space-y-2 p-2.5">
                        <div className="skeleton h-3 w-3/4 rounded" />
                        <div className="skeleton h-2.5 w-1/3 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : library.error ? (
                <div className="rounded-xl border border-danger/25 bg-danger-soft px-5 py-10 text-center">
                  <p className="text-[13.5px] font-medium text-danger">{library.error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => void library.reload()}
                    icon={<RefreshCw className="size-3.5" />}
                  >
                    Retry
                  </Button>
                </div>
              ) : visibleFiles.length === 0 ? (
                <div className="bg-dot-grid rounded-2xl border border-dashed border-line-strong bg-surface/50 px-6 py-16 text-center">
                  <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg-soft shadow-2xs">
                    {debouncedQuery ? (
                      <Search className="size-5" />
                    ) : view === 'starred' ? (
                      <Star className="size-5" />
                    ) : (
                      <Upload className="size-5" />
                    )}
                  </div>
                  <p className="mt-3.5 text-[14px] font-medium text-fg">
                  {debouncedQuery
                    ? 'No matching files'
                    : view === 'starred'
                      ? 'No starred files yet'
                      : view === 'archive'
                        ? 'No archived files yet'
                        : MEDIA_VIEWS.has(view)
                          ? `No ${VIEW_LABELS[view].toLowerCase()} yet`
                          : 'This folder is empty'}
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
                    {debouncedQuery
                      ? 'Try a different keyword or press ⌘K to jump anywhere in your drive.'
                      : 'Drop files anywhere, paste from clipboard (⌘V), or click Upload.'}
                  </p>
                  {!debouncedQuery && view !== 'starred' && (
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="primary"
                        size="md"
                        icon={<Upload className="size-3.5" />}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload files
                      </Button>
                      {view === 'all' && (
                        <Button
                          variant="secondary"
                          size="md"
                          icon={<FolderPlus className="size-3.5" />}
                          onClick={() => {
                            ensureNoDialog();
                            setNewFolderOpen(true);
                          }}
                        >
                          New folder
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : layout === 'grid' ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {visibleFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      selected={selection.has(file.id)}
                      selectedIds={selection}
                      showFolderBadge={showFolderBadge}
                      handlers={handlers}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  {/* Interactive sortable table header */}
                  <div className="hidden grid-cols-[auto_1fr_80px_92px_116px_auto] items-center gap-3 border-b border-line bg-surface-2/40 px-3 py-2 font-mono text-[10.5px] font-medium tracking-wider text-muted uppercase sm:grid">
                    <button
                      type="button"
                      aria-label={allVisibleSelected ? 'Deselect all' : 'Select all'}
                      onClick={() => {
                        if (allVisibleSelected) setSelection(new Set());
                        else setSelection(new Set(visibleFiles.map((f) => f.id)));
                      }}
                      className={cn(
                        'flex size-4.5 items-center justify-center rounded-[5px] border transition-colors',
                        allVisibleSelected
                          ? 'border-accent bg-accent text-white'
                          : 'border-line-strong hover:border-fg',
                      )}
                    >
                      {allVisibleSelected && (
                        <svg viewBox="0 0 16 16" className="size-2.5" fill="none">
                          <path
                            d="M3.5 8.5l3 3 6-7"
                            stroke="currentColor"
                            strokeWidth="2.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleSort('name')}
                      className="inline-flex items-center gap-1 text-left transition-colors hover:text-fg"
                    >
                      <span>Name</span>
                      <SortIndicator column="name" />
                    </button>

                    <span>Kind</span>

                    <button
                      type="button"
                      onClick={() => toggleSort('size')}
                      className="inline-flex items-center gap-1 text-left transition-colors hover:text-fg"
                    >
                      <span>Size</span>
                      <SortIndicator column="size" />
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleSort('date')}
                      className="inline-flex items-center gap-1 text-left transition-colors hover:text-fg"
                    >
                      <span>Uploaded</span>
                      <SortIndicator column="date" />
                    </button>

                    <span className="w-[88px]" />
                  </div>

                  <div className="divide-y divide-[var(--border-subtle)]">
                    {visibleFiles.map((file) => (
                      <FileRow
                        key={file.id}
                        file={file}
                        selected={selection.has(file.id)}
                        selectedIds={selection}
                        showFolderBadge={showFolderBadge}
                        handlers={handlers}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Demo banner */}
            {runtime.demo && library.files.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5">
                <Badge tone="warning">Demo</Badge>
                <p className="text-[12px] text-muted">
                  Sample workspace active. Connect cloud storage in your server setup to keep
                  uploads permanently across devices.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Floating multi-select action dock */}
        {selection.size > 0 && (
          <div className="animate-slide-up pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-line-strong bg-surface/95 px-3 py-2 shadow-float backdrop-blur-md">
              <span className="px-1.5 text-[12.5px] font-medium text-fg">
                {selection.size} selected
              </span>
              <span className="mr-1 font-mono text-[11px] text-muted tabular-nums">
                ({formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))})
              </span>

              <div className="mx-1 h-4 w-px bg-line-strong" />

              <Button
                size="sm"
                variant="ghost"
                icon={<FolderInput className="size-3.5" />}
                onClick={() => {
                  ensureNoDialog();
                  setMoveTarget(selectedFiles);
                }}
              >
                Move
              </Button>

              <Button
                size="sm"
                variant="ghost"
                icon={<Download className="size-3.5" />}
                onClick={() => {
                  selectedFiles.forEach((file) => download(file, true));
                  toast.info(`Downloading ${selectedFiles.length} files`);
                }}
              >
                Download
              </Button>

              {view === 'archive' ? (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<RotateCcw className="size-3.5" />}
                    onClick={restoreSelection}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => {
                      ensureNoDialog();
                      setDeleteTarget({ type: 'selection', files: selectedFiles });
                    }}
                  >
                    Delete forever
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => {
                    ensureNoDialog();
                    setDeleteTarget({ type: 'selection', files: selectedFiles });
                  }}
                >
                  Delete
                </Button>
              )}

              <IconButton
                label="Clear selection"
                onClick={() => setSelection(new Set())}
                className="ml-0.5 size-7"
              >
                <X className="size-3.5" />
              </IconButton>
            </div>
          </div>
        )}

        {/* External file drag overlay */}
        {draggingExternal && (
          <div className="animate-fade-in pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-xs">
            <div className="flex w-full max-w-md flex-col items-center rounded-2xl border-2 border-dashed border-accent bg-surface p-10 text-center shadow-float">
              <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Upload className="size-6" />
              </div>
              <p className="mt-3.5 text-[15px] font-semibold text-fg">
                Drop files to upload
              </p>
              <p className="mt-1 font-mono text-[12px] text-muted">
                Destination: /{targetUploadFolder}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right-hand details inspector (desktop inline, mobile slide-over) */}
      {inspectorOpen && (
        <>
          <div className="hidden xl:flex">
            <InspectorPanel
              file={inspectedFile}
              currentFolder={folder}
              visibleCount={visibleFiles.length}
              visibleBytes={visibleBytes}
              onClose={() => setInspectorOpen(false)}
              onOpenPreview={(file) => setPreviewId(file.id)}
              onDownload={(file) => download(file)}
              onToggleStar={toggleStar}
              onRename={(file) => {
                ensureNoDialog();
                setRenameTarget({ type: 'file', value: file.id });
              }}
              onMove={(file) => {
                ensureNoDialog();
                setMoveTarget([file]);
              }}
              onDelete={(file) => {
                ensureNoDialog();
                setDeleteTarget({ type: 'file', file });
              }}
              onRestore={restoreFile}
              share={
                currentShare
                  ? {
                      token: currentShare.share.token,
                      downloadUrl: currentShare.downloadUrl,
                      expiresAt: currentShare.share.expiresAt,
                    }
                  : null
              }
              onCreateShare={handleCreateShare}
              onRevokeShare={handleRevokeShare}
              shareBusy={shareBusy}
              onNavigateFolder={navigateFolder}
            />
          </div>

          <div className="fixed inset-0 z-40 xl:hidden">
            <div
              className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-[2px]"
              onClick={() => setInspectorOpen(false)}
            />
            <div className="animate-slide-in-right absolute inset-y-0 right-0">
              <InspectorPanel
                file={inspectedFile}
                currentFolder={folder}
                visibleCount={visibleFiles.length}
                visibleBytes={visibleBytes}
                onClose={() => setInspectorOpen(false)}
                onOpenPreview={(file) => setPreviewId(file.id)}
                onDownload={(file) => download(file)}
                onToggleStar={toggleStar}
                onRename={(file) => {
                  ensureNoDialog();
                  setRenameTarget({ type: 'file', value: file.id });
                }}
                onMove={(file) => {
                  ensureNoDialog();
                  setMoveTarget([file]);
                }}
                onDelete={(file) => {
                  ensureNoDialog();
                  setDeleteTarget({ type: 'file', file });
                }}
                onRestore={restoreFile}
              share={
                currentShare
                  ? {
                      token: currentShare.share.token,
                      downloadUrl: currentShare.downloadUrl,
                      expiresAt: currentShare.share.expiresAt,
                    }
                  : null
              }
              onCreateShare={handleCreateShare}
              onRevokeShare={handleRevokeShare}
              shareBusy={shareBusy}
              onNavigateFolder={navigateFolder}
              />
            </div>
          </div>
        </>
      )}

      {/* Upload transfer queue */}
      <UploadPanel
        items={uploads.items}
        onCancel={uploads.cancel}
        onRetry={uploads.retry}
        onDismiss={uploads.dismiss}
        onClearFinished={uploads.clearFinished}
        onCancelAll={uploads.cancelAll}
      />

      {/* Lightbox preview */}
      <PreviewModal
        file={previewFile}
        positionLabel={
          previewIndex >= 0 && visibleFiles.length > 1
            ? `${previewIndex + 1} / ${visibleFiles.length}`
            : undefined
        }
        onClose={() => setPreviewId(null)}
        onNavigate={navigatePreview}
        onDownload={(file) => download(file)}
        onToggleStar={toggleStar}
        onDelete={(file) => {
          setPreviewId(null);
          ensureNoDialog();
          setDeleteTarget({ type: 'file', file });
        }}
        onRename={(file) => {
          ensureNoDialog();
          setRenameTarget({ type: 'file', value: file.id });
        }}
        canNavigate={visibleFiles.length > 1 && previewIndex >= 0}
      />

      {/* Command Palette (⌘K) */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        files={library.files}
        folders={folderNodes}
        theme={theme}
        layout={layout}
        onOpenFile={(file) => setPreviewId(file.id)}
        onNavigateFolder={navigateFolder}
        onNavigateView={navigateView}
        onUpload={() => fileInputRef.current?.click()}
        onNewFolder={() => {
          ensureNoDialog();
          setNewFolderOpen(true);
        }}
        onToggleLayout={() => setLayout((v) => (v === 'grid' ? 'list' : 'grid'))}
        onToggleTheme={toggleTheme}
        onToggleInspector={() => setInspectorOpen((v) => !v)}
        onOpenSettings={() => void openSettings()}
      />

      {/* Right-click context menu */}
      <ContextMenuPortal state={contextMenu} onClose={() => setContextMenu(null)} />

      {/* Dialogs */}
      <PromptDialog
        open={newFolderOpen}
        title="New folder"
        description={`Location: /${view === 'all' ? folder : ''}`}
        label="Folder name"
        placeholder="e.g. Q4 Releases"
        confirmLabel="Create"
        icon={
          <div className="flex size-8 items-center justify-center rounded-lg border border-line-strong bg-surface-2 text-fg">
            <FolderPlus className="size-4" />
          </div>
        }
        busy={busy}
        error={dialogError}
        onConfirm={createFolder}
        onClose={() => setNewFolderOpen(false)}
        validate={(value) =>
          value.includes('/') ? 'Folder names cannot contain slashes.' : null
        }
      />

      <PromptDialog
        open={Boolean(renameTarget)}
        title={renameTarget?.type === 'folder' ? 'Rename folder' : 'Rename file'}
        label="New name"
        initialValue={
          renameTarget?.type === 'folder'
            ? renameTarget.value.split('/').pop() ?? ''
            : library.files.find((file) => file.id === renameTarget?.value)?.name ?? ''
        }
        confirmLabel="Save"
        busy={busy}
        error={dialogError}
        onConfirm={(value) =>
          renameTarget?.type === 'folder' ? void renameFolder(value) : void renameFile(value)
        }
        onClose={() => setRenameTarget(null)}
      />

      <MoveDialog
        open={Boolean(moveTarget && moveTarget.length > 0)}
        titleLabel={
          moveTarget?.length === 1
            ? moveTarget[0].name
            : `${moveTarget?.length ?? 0} selected files`
        }
        folders={folderOptions}
        currentFolder={moveTarget?.length === 1 ? moveTarget[0].folder : undefined}
        busy={busy}
        onMove={(targetPath) => {
          if (moveTarget) {
            void moveFilesBatch(
              moveTarget.map((f) => f.id),
              targetPath,
            );
          }
        }}
        onClose={() => setMoveTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={
          deleteTarget?.type === 'folder'
            ? 'Delete folder?'
            : deleteTarget?.type === 'selection'
              ? 'Delete selected files?'
              : 'Delete file?'
        }
        description={
          view === 'archive'
            ? 'This permanently deletes the selected items and cannot be undone.'
            : deleteTarget?.type === 'selection'
              ? 'These items will be moved to Archive. They can be restored or permanently deleted later.'
              : 'This item will be moved to Archive. It can be restored or permanently deleted later.'
        }
        confirmLabel={
          busy
            ? 'Deleting…'
            : view === 'archive'
              ? 'Delete forever'
              : 'Delete'
        }
        busy={busy}
        details={deleteDetails}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        system={system}
        sessionUsername={username}
        stats={library.stats}
        onRefreshSystem={() => {
          setSystem(null);
          void openSettings();
        }}
        onLogout={logout}
      />
    </div>
  );
}
