'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownAZ,
  ArrowUpDown,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  FolderOpen,
  FolderPlus,
  Grid2x2,
  Home,
  LayoutList,
  Menu as MenuIcon,
  Moon,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Star,
  Sun,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { api, ApiError, type SessionInfo, type SystemInfo } from '@/lib/client-api';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/format';
import { useLibrary, folderTree, type LibraryView } from '@/lib/use-library';
import { useUploadQueue } from '@/lib/use-uploads';
import type { StoredFile } from '@/lib/types';
import { Badge, Button, IconButton, Menu } from '@/components/ui';
import { useTheme } from '@/components/theme';
import { useToast } from '@/components/toast';
import { Sidebar } from './sidebar';
import { FileCard, FileRow, type FileActionHandlers } from './file-item';
import { FolderCard } from './folder-item';
import { UploadPanel } from './upload-panel';
import { PreviewModal } from './preview-modal';
import {
  ConfirmDialog,
  MoveDialog,
  PromptDialog,
  SettingsDialog,
} from './dialogs';

type SortKey = 'date' | 'name' | 'size';

type Props = {
  username: string | null;
  runtime: SessionInfo['runtime'];
  indexBackend: string;
};

const SORT_LABELS: Record<SortKey, string> = {
  date: 'Newest first',
  name: 'Name A–Z',
  size: 'Largest first',
};

export function FileManager({ username, runtime, indexBackend }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { theme, toggleTheme } = useTheme();
  const library = useLibrary();

  const [view, setView] = useState<LibraryView>('all');
  const [folder, setFolder] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [dragging, setDragging] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; value: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<StoredFile | null>(null);
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

    if (search) {
      return library.files.filter(
        (file) =>
          file.name.toLowerCase().includes(search) ||
          file.folder.toLowerCase().includes(search),
      );
    }
    if (view === 'starred') return library.files.filter((file) => file.starred);
    if (view === 'recent') return [...library.files].sort((a, b) => b.createdAt - a.createdAt);
    return library.files.filter((file) => file.folder === folder);
  }, [debouncedQuery, folder, library.files, view]);

  const visibleFiles = useMemo(() => {
    const files = [...baseFiles];
    switch (sort) {
      case 'name':
        return files.sort((a, b) => a.name.localeCompare(b.name));
      case 'size':
        return files.sort((a, b) => b.size - a.size);
      case 'date':
      default:
        return files.sort((a, b) => b.createdAt - a.createdAt);
    }
  }, [baseFiles, sort]);

  const breadcrumbs = useMemo(() => {
    const segments = folder.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      label: segment,
      path: segments.slice(0, index + 1).join('/'),
    }));
  }, [folder]);

  const title = debouncedQuery
    ? `Search results`
    : view === 'starred'
      ? 'Starred'
      : view === 'recent'
        ? 'Recent uploads'
        : breadcrumbs.length > 0
          ? breadcrumbs[breadcrumbs.length - 1].label
          : 'All files';

  const showFolders = view === 'all' && !debouncedQuery && childFolders.length > 0;

  /* -------------------------------- uploads -------------------------------- */

  const handleUploaded = useCallback(
    (file: StoredFile) => {
      toast.success(`Uploaded ${file.name}`, formatBytes(file.size));
      void library.refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
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
  });

  const addFiles = useCallback(
    (files: File[] | FileList) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      uploads.addFiles(list, folder);
      toast.info(
        `Queued ${list.length} file${list.length === 1 ? '' : 's'}`,
        `Uploading to ${folder || 'Home'}`,
      );
    },
    [folder, toast, uploads],
  );

  /* ------------------------------ interactions ----------------------------- */

  const navigateFolder = (path: string) => {
    setView('all');
    setFolder(path);
    setQuery('');
    setDebouncedQuery('');
    setSelection(new Set());
    setSidebarOpen(false);
  };

  const navigateView = (next: LibraryView) => {
    setView(next);
    setQuery('');
    setDebouncedQuery('');
    setSelection(new Set());
    if (next === 'all') setFolder('');
    setSidebarOpen(false);
  };

  const download = useCallback((file: StoredFile) => {
    const link = document.createElement('a');
    link.href = api.downloadUrl(file.id);
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const toggleStar = useCallback(
    async (file: StoredFile) => {
      try {
        await api.patchFile(file.id, { starred: !file.starred });
        await library.refresh();
      } catch (error) {
        toast.error('Could not update star', (error as Error).message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toast],
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

  const createFolder = async (name: string) => {
    setBusy(true);
    setDialogError(null);
    try {
      const result = await api.createFolder(folder, name);
      await library.refresh();
      setNewFolderOpen(false);
      toast.success('Folder created', result.path);
      navigateFolder(result.path);
    } catch (error) {
      setDialogError(error instanceof ApiError ? error.message : 'Could not create folder.');
    } finally {
      setBusy(false);
    }
  };

  const renameFile = async (name: string) => {
    if (!renameTarget || renameTarget.type !== 'file') return;
    setBusy(true);
    setDialogError(null);
    try {
      await api.patchFile(renameTarget.value, { name });
      await library.refresh();
      setRenameTarget(null);
      toast.success('File renamed', name);
    } catch (error) {
      setDialogError(error instanceof ApiError ? error.message : 'Could not rename file.');
    } finally {
      setBusy(false);
    }
  };

  const renameFolder = async (name: string) => {
    if (!renameTarget || renameTarget.type !== 'folder') return;
    setBusy(true);
    setDialogError(null);
    try {
      const result = await api.renameFolder(renameTarget.value, name);
      await library.refresh();
      setRenameTarget(null);
      toast.success('Folder renamed', result.path);
      if (folder === renameTarget.value || folder.startsWith(`${renameTarget.value}/`)) {
        setFolder(result.path + folder.slice(renameTarget.value.length));
      }
    } catch (error) {
      setDialogError(error instanceof ApiError ? error.message : 'Could not rename folder.');
    } finally {
      setBusy(false);
    }
  };

  const moveFile = async (target: string) => {
    if (!moveTarget) return;
    setBusy(true);
    try {
      await api.patchFile(moveTarget.id, { folder: target });
      await library.refresh();
      setMoveTarget(null);
      toast.success('File moved', target || 'Home');
    } catch (error) {
      toast.error('Could not move file', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      if (deleteTarget.type === 'file') {
        await api.deleteFile(deleteTarget.file.id);
        toast.success('File deleted', deleteTarget.file.name);
      } else if (deleteTarget.type === 'selection') {
        await Promise.all(deleteTarget.files.map((file) => api.deleteFile(file.id)));
        toast.success(
          `Deleted ${deleteTarget.files.length} files`,
          formatBytes(deleteTarget.files.reduce((sum, file) => sum + file.size, 0)),
        );
        setSelection(new Set());
      } else {
        const result = await api.deleteFolder(deleteTarget.path);
        toast.success('Folder deleted', `${result.removedFiles} files removed`);
      }
      await library.refresh();
      setDeleteTarget(null);
    } catch (error) {
      toast.error('Delete failed', (error as Error).message);
    } finally {
      setBusy(false);
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

  /* -------------------------------- effects -------------------------------- */

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    try {
      const storedLayout = window.localStorage.getItem('tellynas-layout');
      if (storedLayout === 'list' || storedLayout === 'grid') setLayout(storedLayout);
      const storedSort = window.localStorage.getItem('tellynas-sort') as SortKey | null;
      if (storedSort && ['date', 'name', 'size'].includes(storedSort)) setSort(storedSort);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('tellynas-layout', layout);
      window.localStorage.setItem('tellynas-sort', sort);
    } catch {
      /* ignore */
    }
  }, [layout, sort]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && !typing) {
        setSelection(new Set());
        setPreviewId(null);
      }
      if ((event.key === 'u' || event.key === 'U') && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        fileInputRef.current?.click();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /* -------------------------------- handlers ------------------------------- */

  const handlers: FileActionHandlers = {
    onOpen: (file) => setPreviewId(file.id),
    onDownload: download,
    onToggleStar: toggleStar,
    onRename: (file) => {
      ensureNoDialog();
      setRenameTarget({ type: 'file', value: file.id });
    },
    onMove: (file) => {
      ensureNoDialog();
      setMoveTarget(file);
    },
    onDelete: (file) => {
      ensureNoDialog();
      setDeleteTarget({ type: 'file', file });
    },
    onToggleSelect: toggleSelect,
  };

  const selectedFiles = useMemo(
    () => library.files.filter((file) => selection.has(file.id)),
    [library.files, selection],
  );

  const previewIndex = visibleFiles.findIndex((file) => file.id === previewId);
  const previewFile = previewIndex >= 0 ? visibleFiles[previewIndex] : null;

  const navigatePreview = (direction: -1 | 1) => {
    if (visibleFiles.length < 2 || previewIndex < 0) return;
    const nextIndex =
      (previewIndex + direction + visibleFiles.length) % visibleFiles.length;
    setPreviewId(visibleFiles[nextIndex].id);
  };

  const folderOptions = useMemo(() => folderNodes.map((node) => node.path), [folderNodes]);

  const deleteDetails = useMemo(() => {
    if (!deleteTarget) return null;
    if (deleteTarget.type === 'file') {
      return (
        <div className="space-y-1 rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px]">
          <p className="truncate font-medium text-fg">{deleteTarget.file.name}</p>
          <p className="text-muted">
            {formatBytes(deleteTarget.file.size)} · {deleteTarget.file.chunks.length} Telegram
            message{deleteTarget.file.chunks.length === 1 ? '' : 's'}
          </p>
        </div>
      );
    }
    if (deleteTarget.type === 'selection') {
      return (
        <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px] text-muted">
          <p className="font-medium text-fg">{deleteTarget.files.length} selected files</p>
          <p>
            {formatBytes(deleteTarget.files.reduce((sum, file) => sum + file.size, 0))} will be
            removed from Telegram.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-line bg-surface-2/60 p-3 text-[12.5px] text-muted">
        <p className="font-medium text-fg">{deleteTarget.path}</p>
        <p>
          {deleteTarget.files} files · {formatBytes(deleteTarget.bytes)} will be removed.
        </p>
      </div>
    );
  }, [deleteTarget]);

  /* --------------------------------- render -------------------------------- */

  const sortMenu = (
    <Menu
      label="Sort files"
      trigger={<SlidersHorizontal className="size-4" />}
      items={[
        {
          label: SORT_LABELS.date,
          icon: <CalendarClock className="size-3.5" />,
          onSelect: () => setSort('date'),
        },
        {
          label: SORT_LABELS.name,
          icon: <ArrowDownAZ className="size-3.5" />,
          onSelect: () => setSort('name'),
        },
        {
          label: SORT_LABELS.size,
          icon: <ArrowUpDown className="size-3.5" />,
          onSelect: () => setSort('size'),
        },
      ]}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <Sidebar
          view={view}
          folder={folder}
          folders={folderNodes}
          stats={library.stats}
          starredCount={starredCount}
          demo={runtime.demo}
          username={username}
          onNavigateView={navigateView}
          onNavigateFolder={navigateFolder}
          onNewFolder={() => {
            ensureNoDialog();
            setNewFolderOpen(true);
          }}
          onOpenSettings={openSettings}
        />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="animate-fade-in absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="animate-slide-up absolute inset-y-0 left-0">
            <Sidebar
              view={view}
              folder={folder}
              folders={folderNodes}
              stats={library.stats}
              starredCount={starredCount}
              demo={runtime.demo}
              username={username}
              onNavigateView={navigateView}
              onNavigateFolder={navigateFolder}
              onNewFolder={() => {
                ensureNoDialog();
                setNewFolderOpen(true);
                setSidebarOpen(false);
              }}
              onOpenSettings={() => {
                setSidebarOpen(false);
                void openSettings();
              }}
              onCloseMobile={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={(event) => {
          if (!event.dataTransfer?.types.includes('Files')) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => {
          if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
        }}
      >
        {/* Top bar */}
        <header className="z-20 flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface/70 px-3 py-2.5 backdrop-blur-xl sm:px-5">
          <IconButton
            label="Open menu"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <MenuIcon className="size-5" />
          </IconButton>

          <div className="order-2 flex min-w-0 flex-1 items-center gap-1.5 sm:order-1">
            <button
              type="button"
              onClick={() => navigateFolder('')}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-[13px] font-medium text-fg transition hover:bg-surface-2"
            >
              <Home className="size-3.5 text-muted" />
              <span className={cn(breadcrumbs.length === 0 && !debouncedQuery && 'text-fg')}>
                Home
              </span>
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.path} className="flex min-w-0 items-center gap-1.5">
                <ChevronRight className="size-3.5 shrink-0 text-muted/60" />
                <button
                  type="button"
                  onClick={() => navigateFolder(crumb.path)}
                  className="max-w-[160px] truncate rounded-lg px-1.5 py-1 text-[13px] text-fg-soft transition hover:bg-surface-2 hover:text-fg"
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            {debouncedQuery && (
              <span className="flex items-center gap-1.5">
                <ChevronRight className="size-3.5 text-muted/60" />
                <span className="text-[13px] text-accent">“{debouncedQuery}”</span>
              </span>
            )}
          </div>

          <div className="order-1 flex w-full items-center gap-2 sm:order-2 sm:w-auto">
            <div className="relative flex-1 sm:w-64 sm:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files…  ( / )"
                aria-label="Search files"
                className="h-9 w-full rounded-xl border border-line bg-surface-2 pr-8 pl-9 text-[13px] text-fg outline-none transition placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <IconButton label="Toggle theme" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </IconButton>
            <IconButton label="Open settings" onClick={() => void openSettings()}>
              <Settings2 className="size-4" />
            </IconButton>
            <Button
              variant="primary"
              size="md"
              className="shrink-0"
              icon={<UploadCloud className="size-4" />}
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

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-3 pt-4 pb-24 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {debouncedQuery
                    ? `${visibleFiles.length} match${visibleFiles.length === 1 ? '' : 'es'}`
                    : `${visibleFiles.length} file${visibleFiles.length === 1 ? '' : 's'}${
                        showFolders ? ` · ${childFolders.length} folders` : ''
                      }`}
                  {library.refreshing && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px]">
                      <RefreshCw className="size-3 animate-spin" /> syncing
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="flex items-center rounded-xl border border-line bg-surface-2 p-0.5">
                  <button
                    type="button"
                    aria-label="Grid view"
                    aria-pressed={layout === 'grid'}
                    onClick={() => setLayout('grid')}
                    className={cn(
                      'rounded-lg p-1.5 transition',
                      layout === 'grid'
                        ? 'bg-surface text-fg shadow-sm'
                        : 'text-muted hover:text-fg',
                    )}
                  >
                    <Grid2x2 className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="List view"
                    aria-pressed={layout === 'list'}
                    onClick={() => setLayout('list')}
                    className={cn(
                      'rounded-lg p-1.5 transition',
                      layout === 'list'
                        ? 'bg-surface text-fg shadow-sm'
                        : 'text-muted hover:text-fg',
                    )}
                  >
                    <LayoutList className="size-4" />
                  </button>
                </div>

                {sortMenu}

                <Menu
                  label="Folder actions"
                  trigger={<MoreHorizontal className="size-4" />}
                  items={[
                    {
                      label: 'Create folder',
                      icon: <FolderPlus className="size-3.5" />,
                      onSelect: () => {
                        ensureNoDialog();
                        setNewFolderOpen(true);
                      },
                    },
                    ...(folder
                      ? [
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
                        ]
                      : []),
                  ]}
                />
              </div>
            </div>

            {/* Selection bar */}
            {selection.size > 0 && (
              <div className="animate-slide-up mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent-soft px-3 py-2">
                <CheckSquare className="size-4 text-accent" />
                <p className="text-[12.5px] font-medium text-accent">
                  {selection.size} selected ·{' '}
                  {formatBytes(selectedFiles.reduce((sum, file) => sum + file.size, 0))}
                </p>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setSelection(new Set())}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      selectedFiles.forEach((file) => download(file));
                      toast.info(`Downloading ${selectedFiles.length} files`);
                    }}
                  >
                    Download
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
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {/* Folders */}
            {showFolders && (
              <section className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                    Folders
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      ensureNoDialog();
                      setNewFolderOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
                  >
                    <FolderPlus className="size-3.5" /> New folder
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {childFolders.map((node) => (
                    <FolderCard
                      key={node.path}
                      path={node.path}
                      name={node.name}
                      count={node.totalCount}
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
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Files */}
            <section className="mt-5">
              {showFolders && visibleFiles.length > 0 && (
                <h2 className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted uppercase">
                  Files
                </h2>
              )}

              {library.loading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={index}
                      className="overflow-hidden rounded-2xl border border-line bg-surface"
                    >
                      <div className="skeleton h-32 w-full" />
                      <div className="space-y-2 p-3">
                        <div className="skeleton h-3 w-2/3 rounded" />
                        <div className="skeleton h-2.5 w-1/3 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : library.error ? (
                <div className="rounded-2xl border border-danger/25 bg-danger-soft px-5 py-8 text-center">
                  <p className="text-sm font-medium text-danger">{library.error}</p>
                  <Button
                    variant="secondary"
                    className="mt-3"
                    onClick={() => void library.reload()}
                    icon={<RefreshCw className="size-4" />}
                  >
                    Try again
                  </Button>
                </div>
              ) : visibleFiles.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line-strong bg-surface/40 px-6 py-14 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                    {debouncedQuery ? (
                      <Search className="size-6" />
                    ) : view === 'starred' ? (
                      <Star className="size-6" />
                    ) : (
                      <UploadCloud className="size-6" />
                    )}
                  </div>
                  <p className="mt-4 text-sm font-medium text-fg">
                    {debouncedQuery
                      ? 'No files match your search'
                      : view === 'starred'
                        ? 'No starred files yet'
                        : 'Nothing here yet'}
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-relaxed text-muted">
                    {debouncedQuery
                      ? 'Try a different name, or clear the search to browse folders.'
                      : 'Drag files anywhere on this page, or use the Upload button to send them to Telegram.'}
                  </p>
                  {!debouncedQuery && view !== 'starred' && (
                    <Button
                      variant="primary"
                      className="mt-5"
                      icon={<UploadCloud className="size-4" />}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Upload files
                    </Button>
                  )}
                </div>
              ) : layout === 'grid' ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {visibleFiles.map((file) => (
                    <FileCard
                      key={file.id}
                      file={file}
                      selected={selection.has(file.id)}
                      handlers={handlers}
                    />
                  ))}
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-line bg-surface">
                  <div className="hidden grid-cols-[auto_1fr_92px_120px_auto] items-center gap-3 border-b border-line px-3 py-2 text-[10.5px] font-semibold tracking-[0.08em] text-muted uppercase sm:grid">
                    <span className="size-5" />
                    <span>Name</span>
                    <span>Size</span>
                    <span>Uploaded</span>
                    <span className="w-16" />
                  </div>
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {visibleFiles.map((file) => (
                      <FileRow
                        key={file.id}
                        file={file}
                        selected={selection.has(file.id)}
                        handlers={handlers}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Demo hint */}
            {runtime.demo && library.files.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
                <Badge tone="warning">Demo mode</Badge>
                <p className="text-[12px] text-muted">
                  Files live in server memory. Set{' '}
                  <code className="font-mono text-fg-soft">TELEGRAM_BOT_TOKEN</code> and{' '}
                  <code className="font-mono text-fg-soft">TELEGRAM_CHAT_ID</code> to store them in
                  your chat.
                </p>
              </div>
            )}
          </div>
        </main>

        {/* Drag overlay */}
        {dragging && (
          <div className="animate-fade-in pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/50 backdrop-blur-sm">
            <div className="rounded-2xl border-2 border-dashed border-accent/60 bg-surface/95 px-10 py-8 text-center shadow-float">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <UploadCloud className="size-7" />
              </div>
              <p className="mt-3 text-sm font-medium text-fg">Drop files to upload</p>
              <p className="mt-1 text-[12px] text-muted">
                They will be added to {folder || 'Home'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Upload queue */}
      <UploadPanel
        items={uploads.items}
        onCancel={uploads.cancel}
        onRetry={uploads.retry}
        onDismiss={uploads.dismiss}
        onClearFinished={uploads.clearFinished}
        onCancelAll={uploads.cancelAll}
      />

      {/* Preview */}
      <PreviewModal
        file={previewFile}
        onClose={() => setPreviewId(null)}
        onNavigate={navigatePreview}
        onDownload={download}
        onToggleStar={toggleStar}
        onDelete={(file) => {
          setPreviewId(null);
          ensureNoDialog();
          setDeleteTarget({ type: 'file', file });
        }}
        onRename={() => undefined}
        canNavigate={visibleFiles.length > 1}
      />

      {/* Dialogs */}
      <PromptDialog
        open={newFolderOpen}
        title="New folder"
        description={`Created inside ${folder || 'Home'}.`}
        label="Folder name"
        placeholder="e.g. Photos 2025"
        confirmLabel="Create folder"
        icon={
          <div className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
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
        open={Boolean(moveTarget)}
        fileName={moveTarget?.name ?? ''}
        folders={folderOptions}
        currentFolder={moveTarget?.folder ?? ''}
        busy={busy}
        onMove={moveFile}
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
        description="This removes the Telegram messages that hold the data."
        confirmLabel={busy ? 'Deleting…' : 'Delete'}
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
        indexBackend={indexBackend}
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
