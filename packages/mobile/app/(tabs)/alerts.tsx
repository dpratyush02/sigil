import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,

  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import DetectionCard from '../../components/DetectionCard';
import OfflineBanner from '../../components/OfflineBanner';
import { AlertCardSkeleton } from '../../components/LoadingSkeleton';
import { useScanner } from '../../hooks/useScanner';
import type { AlertSource } from '../../services/scanner';

type SourceFilter = 'All' | AlertSource;
type SeverityFilter = 'All' | 'High' | 'Medium' | 'Low';
type SortMode = 'newest' | 'confidence';
type ViewMode = 'active' | 'archived';

const SOURCE_FILTERS: SourceFilter[] = [
  'All', 'GitHub', 'Reddit', 'StackOverflow', 'HuggingFace', 'npm', 'Web',
];

const PAGE_SIZE = 20;

function getSeverity(confidence: number): SeverityFilter {
  if (confidence >= 85) return 'High';
  if (confidence >= 70) return 'Medium';
  return 'Low';
}

export default function AlertsScreen() {
  const { alerts, loadAlerts, runScan, isScanning, markReviewed, archiveAlert, unreadCount } = useScanner();

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('All');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    loadAlerts().finally(() => setLoading(false));
  }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
    }, 280);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchDraft]);

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [sourceFilter, severityFilter, sortMode, viewMode, search]);



  const onRefresh = async () => {
    setRefreshing(true);
    await runScan();
    setRefreshing(false);
  };

  // ── Full filtered list ─────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = viewMode === 'archived'
      ? alerts.filter((a) => a.archived)
      : alerts.filter((a) => !a.archived);

    if (sourceFilter !== 'All') result = result.filter((a) => a.source === sourceFilter);
    if (severityFilter !== 'All') {
      result = result.filter((a) => getSeverity(a.confidence) === severityFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.contentName.toLowerCase().includes(q) ||
          a.reason?.toLowerCase().includes(q) ||
          a.source.toLowerCase().includes(q) ||
          a.sourceUrl?.toLowerCase().includes(q)
      );
    }

    if (sortMode === 'newest') result = [...result].sort((a, b) => b.detectedAt - a.detectedAt);
    else result = [...result].sort((a, b) => b.confidence - a.confidence);

    return result;
  }, [alerts, sourceFilter, severityFilter, sortMode, viewMode, search]);

  // ── Paginated slice ────────────────────────────────────────────────────────
  const displayed = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore = displayed.length < filtered.length;

  const loadMore = useCallback(() => {
    if (hasMore) setPage((p) => p + 1);
  }, [hasMore]);

  const severityCount = useCallback(
    (s: SeverityFilter) => {
      const base = alerts.filter((a) => !a.archived);
      if (s === 'All') return base.length;
      return base.filter((a) => getSeverity(a.confidence) === s).length;
    },
    [alerts]
  );

  const renderFooter = () => {
    if (!hasMore) return <View style={{ height: 40 }} />;
    return (
      <TouchableOpacity style={s.loadMoreBtn} onPress={loadMore} activeOpacity={0.7}>
        <Text style={s.loadMoreText}>Load More ({filtered.length - displayed.length} remaining)</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.accent} />
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={s.skeletonWrap}>
          <AlertCardSkeleton />
          <AlertCardSkeleton />
          <AlertCardSkeleton />
        </View>
      );
    }

    return (
      <View style={s.emptyState}>
        <View style={s.emptyIconWrap}>
          <Ionicons name="shield-checkmark-outline" size={40} color={Colors.accent} />
        </View>
        <Text style={s.emptyTitle}>
          {viewMode === 'archived' ? 'No archived alerts' : 'No matches found'}
        </Text>
        <Text style={s.emptyMeta}>
          {viewMode === 'archived'
            ? 'Archived alerts will appear here'
            : search || sourceFilter !== 'All' || severityFilter !== 'All'
            ? 'Try adjusting your filters'
            : 'Pull down to scan — SIGIL monitors 6 sources'}
        </Text>
        {viewMode === 'active' && !search && sourceFilter === 'All' && severityFilter === 'All' && (
          <TouchableOpacity
            style={s.scanBtn}
            onPress={onRefresh}
            disabled={isScanning}
            activeOpacity={0.8}
            accessibilityLabel="Run scan now"
            accessibilityRole="button"
          >
            {isScanning
              ? <ActivityIndicator size="small" color="#000" />
              : <Ionicons name="search" size={16} color="#000" />
            }
            <Text style={s.scanBtnText}>{isScanning ? 'Scanning…' : 'Scan Now'}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const severityColors: Record<SeverityFilter, string> = {
    All: Colors.textMuted,
    High: '#EF4444',
    Medium: '#F59E0B',
    Low: '#6B7280',
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      <OfflineBanner />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle} accessibilityRole="header">Alerts</Text>
        <View style={s.headerRight}>
          {unreadCount > 0 && (
            <View style={s.unreadPill}>
              <Text style={s.unreadText}>{unreadCount} new</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => {
              setSearchVisible((v) => !v);
              if (searchVisible) {
                setSearchDraft('');
                setSearch('');
              }
            }}
            style={s.iconBtn}
            accessibilityLabel={searchVisible ? 'Close search' : 'Search alerts'}
            accessibilityRole="button"
          >
            <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRefresh}
            style={s.iconBtn}
            disabled={isScanning || refreshing}
            accessibilityLabel="Refresh and scan"
            accessibilityRole="button"
          >
            {isScanning || refreshing
              ? <ActivityIndicator size="small" color={Colors.accent} />
              : <Ionicons name="refresh-outline" size={20} color={Colors.textPrimary} />
            }
          </TouchableOpacity>
        </View>
      </View>

      {/* Search */}
      {searchVisible && (
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Search alerts…"
            placeholderTextColor={Colors.textMuted}
            value={searchDraft}
            onChangeText={setSearchDraft}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search alerts"
          />
          {searchDraft.length > 0 && (
            <TouchableOpacity onPress={() => setSearchDraft('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* View mode toggle */}
      <View style={s.viewToggle}>
        {(['active', 'archived'] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[s.viewBtn, viewMode === mode && s.viewBtnActive]}
            onPress={() => setViewMode(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === mode }}
          >
            <Text style={[s.viewBtnText, viewMode === mode && s.viewBtnTextActive]}>
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Severity filter row */}
      {viewMode === 'active' && (
        <View style={s.filterRow}>
          {(['All', 'High', 'Medium', 'Low'] as SeverityFilter[]).map((sev) => {
            const count = severityCount(sev);
            const active = severityFilter === sev;
            const color = severityColors[sev];
            return (
              <TouchableOpacity
                key={sev}
                style={[s.sevChip, active && { borderColor: color, backgroundColor: color + '22' }]}
                onPress={() => setSeverityFilter(sev)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.sevChipText, { color: active ? color : Colors.textMuted }]}>
                  {sev}
                  {count > 0 && ` (${count})`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Source scroll + sort */}
      <View style={s.controlsRow}>
        <FlatList
          data={SOURCE_FILTERS}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item}
          contentContainerStyle={s.sourceList}
          renderItem={({ item: src }) => (
            <TouchableOpacity
              style={[s.sourceChip, sourceFilter === src && s.sourceChipActive]}
              onPress={() => setSourceFilter(src)}
              accessibilityRole="button"
              accessibilityState={{ selected: sourceFilter === src }}
            >
              <Text style={[s.sourceChipText, sourceFilter === src && s.sourceChipTextActive]}>
                {src}
              </Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity
          style={s.sortBtn}
          onPress={() => setSortMode((m) => (m === 'newest' ? 'confidence' : 'newest'))}
          accessibilityLabel={`Sort by ${sortMode === 'newest' ? 'confidence' : 'newest'}`}
          accessibilityRole="button"
        >
          <Ionicons name="swap-vertical-outline" size={14} color={Colors.accent} />
          <Text style={s.sortText}>{sortMode === 'newest' ? 'Newest' : 'Confidence'}</Text>
        </TouchableOpacity>
      </View>

      {/* Result count */}
      {!loading && filtered.length > 0 && (
        <Text style={s.resultCount}>
          {filtered.length} alert{filtered.length !== 1 ? 's' : ''}
          {displayed.length < filtered.length ? ` — showing ${displayed.length}` : ''}
        </Text>
      )}

      {/* Alerts list */}
      <FlatList
        data={displayed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DetectionCard
            alert={item}
            onMarkReviewed={!item.reviewed ? () => markReviewed(item.id) : undefined}
            onArchive={!item.archived ? () => archiveAlert(item.id) : undefined}
          />
        )}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        // Performance
        removeClippedSubviews
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={6}
        getItemLayout={(_, index) => ({ length: 170, offset: 170 * index, index })}
        accessibilityLabel="Alerts list"
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadPill: {
    backgroundColor: '#EF444422', borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 3,
    borderWidth: 1, borderColor: '#EF444455',
  },
  unreadText: { fontSize: 11, fontWeight: '700', color: '#EF4444' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginTop: 10, marginBottom: 4,
    backgroundColor: Colors.surface, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },
  viewToggle: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 10,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  viewBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  viewBtnActive: { backgroundColor: Colors.accent },
  viewBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  viewBtnTextActive: { color: '#000' },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginTop: 10,
  },
  sevChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 99, borderWidth: 1, borderColor: Colors.border,
  },
  sevChipText: { fontSize: 12, fontWeight: '700' },
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8,
  },
  sourceList: { paddingLeft: 16, gap: 8, paddingRight: 8 },
  sourceChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 99, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sourceChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  sourceChipText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  sourceChipTextActive: { color: Colors.accent },
  sortBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: Colors.accent + '18', borderRadius: 99,
    borderWidth: 1, borderColor: Colors.accent + '44',
    marginRight: 16,
    flexShrink: 0,
  },
  sortText: { fontSize: 12, fontWeight: '700', color: Colors.accent },
  resultCount: {
    fontSize: 11, color: Colors.textMuted,
    paddingHorizontal: 20, marginTop: 8, marginBottom: 2,
  },
  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  skeletonWrap: { paddingHorizontal: 16, paddingTop: 10 },
  emptyState: {
    alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32, gap: 12,
  },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent + '18', borderWidth: 1,
    borderColor: Colors.accent + '44',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptyMeta: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.accent, borderRadius: 99,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 8,
  },
  scanBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },
  loadMoreBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 16, marginHorizontal: 16, marginTop: 4, marginBottom: 16,
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  loadMoreText: { fontSize: 13, color: Colors.accent, fontWeight: '600' },
});
