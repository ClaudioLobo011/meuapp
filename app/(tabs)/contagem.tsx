import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    FlatList,
    KeyboardAvoidingView,
    ListRenderItem,
    Modal,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { GestureHandlerRootView, Swipeable } from "react-native-gesture-handler";

/** Tipos */
type Item = { codigo: string; cod?: string; nome: string; qtd: number; hora: string };
type CatalogoItem = { cod?: string; codbarras: string; nome: string };

/** Chaves de storage */
const K_READER = "cfg/externalReader";
const K_CATALOGO = "catalogo/produtos";

/** Timings para leitura rápida */
const DEDUPE_MS = 60;   // evita contar duas vezes no mesmo disparo (CR+LF/submit duplo)
const SILENCE_MS = 140; // confirma leitura quando não vem ENTER/TAB

/** Normaliza a leitura:
 * - remove CR/LF/TAB
 * - se houver dígitos, mantém só os dígitos (EAN/UPC)
 * - colapsa repetições: "ABCABC" -> "ABC", "123123123" -> "123"
 */
function normalizeScan(raw: string) {
  let s = raw.replace(/[\r\n\t]+/g, "").trim();

  const onlyDigits = s.replace(/\D+/g, "");
  if (onlyDigits.length >= 8) s = onlyDigits;

  const n = s.length;
  if (n > 0) {
    const ss = (s + s).slice(1, -1);
    const i = ss.indexOf(s);
    if (i !== -1) {
      const period = i + 1;
      if (n % period === 0) s = s.slice(0, period);
    }
  }
  return s;
}

export default function Contagem() {
  const isFocused = useIsFocused();

  /** Estado principal */
  const [itens, setItens] = useState<Item[]>([]);
  const [busca, setBusca] = useState("");

  /** Config / Catálogo */
  const [externalReader, setExternalReader] = useState(false);
  const catalogoRef = useRef<Map<string, CatalogoItem>>(new Map());

  useEffect(() => {
    (async () => {
      const [rdr, cat] = await Promise.all([
        AsyncStorage.getItem(K_READER),
        AsyncStorage.getItem(K_CATALOGO),
      ]);
      setExternalReader(rdr === "1");
      if (cat) {
        try {
          const arr: CatalogoItem[] = JSON.parse(cat);
          const m = new Map<string, CatalogoItem>();
          for (const c of arr) m.set(String(c.codbarras).trim(), c);
          catalogoRef.current = m;
        } catch {}
      }
    })();
  }, []);

  /** Leitor externo: input oculto + foco forçado */
  const readerRef = useRef<TextInput>(null);
  const [readerBuffer, setReaderBuffer] = useState("");
  const lastScanRef = useRef<{ code: string; t: number }>({ code: "", t: 0 });
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSubmit = useRef(false);

  const focusReader = () => {
    if (externalReader) setTimeout(() => readerRef.current?.focus(), 30);
  };

  useEffect(() => {
    if (isFocused) focusReader();
  }, [isFocused, externalReader]);

  /** Modal adicionar manual */
  const [modalVisivel, setModalVisivel] = useState(false);
  const [cod, setCod] = useState("");
  const [codbarras, setCodbarras] = useState("");
  const [nome, setNome] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [erros, setErros] = useState<{ codbarras?: string; nome?: string; quantidade?: string }>({});

  /** Modal confirmar exclusão */
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [targetCodigo, setTargetCodigo] = useState<string | null>(null);
  const [targetNome, setTargetNome] = useState<string | null>(null);

  /** KPIs */
  const produtosDiferentes = useMemo(
    () => new Set(itens.filter((i) => i.qtd > 0).map((i) => i.codigo)).size,
    [itens]
  );
  const quantidadeTotal = useMemo(() => itens.reduce((s, i) => s + i.qtd, 0), [itens]);
  const ultimoProdutoTxt = useMemo(
    () => (itens.length ? itens[0].nome || itens[0].codigo : "—"),
    [itens]
  );

  /** Filtro de busca (cod, codbarras, nome) */
  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter(
      (it) =>
        (it.cod ?? "").toLowerCase().includes(q) ||
        it.codigo.toLowerCase().includes(q) ||
        it.nome.toLowerCase().includes(q)
    );
  }, [busca, itens]);

  /** Commit da leitura com normalização e de-dupe */
  function commitScan(raw: string) {
    const code = normalizeScan(raw);
    if (!code) return;

    const now = Date.now();
    if (code === lastScanRef.current.code && now - lastScanRef.current.t < DEDUPE_MS) {
      return; // mesmo disparo (CR+LF/submit duplo)
    }
    lastScanRef.current = { code, t: now };

    const hora = new Date().toLocaleTimeString();
    const cat = catalogoRef.current.get(code);

    setItens((prev) => {
      const idx = prev.findIndex((x) => x.codigo === code);
      if (idx >= 0) {
        const clone = [...prev];
        const it = clone[idx];
        const atualizado: Item = {
          ...it,
          qtd: it.qtd + 1,
          hora,
          cod: it.cod ?? cat?.cod,
          nome: it.nome || cat?.nome || it.nome,
        };
        return [atualizado, ...clone.slice(0, idx), ...clone.slice(idx + 1)];
      }
      return [{ codigo: code, cod: cat?.cod, nome: cat?.nome ?? "", qtd: 1, hora }, ...prev];
    });
  }

  const clearSilenceTimer = () => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  };

  const onReaderChange = (text: string) => {
    setReaderBuffer(text);
    clearSilenceTimer();

    // ENTER/CR/LF/TAB => commit imediato
    if (/[\r\n\t]/.test(text)) {
      skipNextSubmit.current = true;
      commitScan(text);
      setReaderBuffer("");
      focusReader();
      return;
    }

    // fallback por silêncio (leitores que não enviam ENTER)
    silenceTimer.current = setTimeout(() => {
      commitScan(text);
      setReaderBuffer("");
      focusReader();
    }, SILENCE_MS);
  };

  const onReaderSubmit = (e: any) => {
    if (skipNextSubmit.current) {
      skipNextSubmit.current = false;
      return;
    }
    commitScan(String(e?.nativeEvent?.text ?? readerBuffer));
    setReaderBuffer("");
    focusReader();
  };

  /** Ações da lista */
  function updateQty(codigo: string, delta: number) {
    setItens((prev) => {
      const idx = prev.findIndex((x) => x.codigo === codigo);
      if (idx < 0) return prev;
      const clone = [...prev];
      const it = clone[idx];
      const novo = Math.max(0, it.qtd + delta);
      const hora = new Date().toLocaleTimeString();
      const atualizado: Item = { ...it, qtd: novo, hora };
      return [atualizado, ...clone.slice(0, idx), ...clone.slice(idx + 1)];
    });
  }

  function pedirConfirmacaoExcluir(codigo: string, nome?: string) {
    setTargetCodigo(codigo);
    setTargetNome(nome ?? codigo);
    setConfirmVisible(true);
  }

  function confirmarExcluir() {
    if (!targetCodigo) return;
    setItens((prev) => prev.filter((x) => x.codigo !== targetCodigo));
    setConfirmVisible(false);
    setTargetCodigo(null);
    setTargetNome(null);
  }

  const DeleteAction = ({ onPress }: { onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.delAction}>
      <Text style={s.delText}>Excluir</Text>
    </TouchableOpacity>
  );

  const renderItem: ListRenderItem<Item> = ({ item }) => (
    <Swipeable
      renderRightActions={() => (
        <DeleteAction onPress={() => pedirConfirmacaoExcluir(item.codigo, item.nome)} />
      )}
      overshootRight={false}
    >
      <View style={s.row}>
        <View style={s.colCod}>
          <Text style={s.codLabel}>Cod</Text>
          <Text style={s.codValue} numberOfLines={1}>
            {item.cod ?? "—"}
          </Text>
        </View>

        <View style={s.colInfo}>
          <Text style={s.codbarras} numberOfLines={1}>
            {item.codigo}
          </Text>
          <Text style={s.nome} numberOfLines={2}>
            {item.nome}
          </Text>
        </View>

        <View style={s.colQty}>
          <TouchableOpacity
            onPress={() => updateQty(item.codigo, -1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.qtyBtn}>–</Text>
          </TouchableOpacity>
          <Text style={s.qtd} numberOfLines={1}>
            {item.qtd}
          </Text>
          <TouchableOpacity
            onPress={() => updateQty(item.codigo, +1)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.qtyBtn}>+</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Swipeable>
  );

  /** Salvar via modal manual */
  function salvarDoModal() {
    const e: typeof erros = {};
    if (!codbarras.trim()) e.codbarras = "Obrigatório";
    if (!nome.trim()) e.nome = "Obrigatório";
    const q = Number(String(quantidade).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) e.quantidade = "Informe um número > 0";
    setErros(e);
    if (Object.keys(e).length) return;

    const hora = new Date().toLocaleTimeString();
    setItens((prev) => {
      const code = codbarras.trim();
      const idx = prev.findIndex((x) => x.codigo === code);
      if (idx >= 0) {
        const clone = [...prev];
        const it = clone[idx];
        const atualizado: Item = {
          ...it,
          qtd: it.qtd + q,
          hora,
          cod: cod || it.cod,
          nome: nome || it.nome,
        };
        return [atualizado, ...clone.slice(0, idx), ...clone.slice(idx + 1)];
      }
      return [
        { codigo: code, cod: cod.trim() || undefined, nome: nome.trim(), qtd: q, hora },
        ...prev,
      ];
    });

    setCod("");
    setCodbarras("");
    setNome("");
    setQuantidade("");
    setErros({});
    setModalVisivel(false);
  }

  return (
    <GestureHandlerRootView
      style={{ flex: 1, backgroundColor: "#fff" }}
      onTouchStart={focusReader}
    >
      {/* Input invisível do leitor externo */}
      {externalReader && (
        <TextInput
          ref={readerRef}
          value={readerBuffer}
          onChangeText={onReaderChange}
          onSubmitEditing={onReaderSubmit}
          style={s.hiddenInput}
          autoFocus
          blurOnSubmit={false}
          showSoftInputOnFocus={false}
          autoCapitalize="none"
          autoCorrect={false}
          importantForAutofill="no"
          pointerEvents="none"
        />
      )}

      {/* Cabeçalho */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LobosTi Contagem</Text>
        {externalReader ? <Text style={s.readerBadge}>Leitor externo: ON</Text> : null}
      </View>

      {/* KPIs */}
      <View style={s.kpisRow}>
        <KpiCard label="Produtos" hint="(diferentes)" value={String(produtosDiferentes)} />
        <KpiCard label="Quantidade Total" value={String(quantidadeTotal)} />
      </View>

      {/* Busca + Último (busca bloqueada com leitor ON) */}
      <View style={s.searchRow}>
        <TextInput
          value={busca}
          onChangeText={setBusca}
          placeholder="Buscar por cod, codbarras ou nome"
          style={s.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!externalReader}
          onFocus={() => {
            if (externalReader) focusReader();
          }}
        />
        <View style={s.lastBox}>
          <Text style={s.lastLabel}>Último</Text>
          <Text style={s.lastValue} numberOfLines={1}>
            {ultimoProdutoTxt}
          </Text>
        </View>
      </View>

      {/* Lista */}
      <FlatList
        style={{ backgroundColor: "#fff" }}
        data={itensFiltrados}
        keyExtractor={(it) => it.codigo}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={s.sep} />}
        contentContainerStyle={
          itensFiltrados.length
            ? { paddingBottom: 96 }
            : {
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#fff",
              }
        }
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Text style={s.emptyTitle}>Nenhum item listado</Text>
            <Text style={s.emptyHint}>Use o botão “+” ou o leitor externo.</Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />

      {/* FAB "+" */}
      <TouchableOpacity style={s.fab} onPress={() => setModalVisivel(true)} activeOpacity={0.8}>
        <Text style={s.fabIcon}>＋</Text>
      </TouchableOpacity>

      {/* Modal: adicionar manual */}
      <Modal
        visible={modalVisivel}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisivel(false)}
      >
        <View style={s.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={s.modalCard}
          >
            <Text style={s.modalTitle}>Adicionar item</Text>

            <Text style={s.label}>cod (opcional)</Text>
            <TextInput
              value={cod}
              onChangeText={setCod}
              placeholder="Ex.: 12345"
              style={s.input}
              autoCapitalize="none"
            />

            <Text style={s.label}>codbarras *</Text>
            <TextInput
              value={codbarras}
              onChangeText={setCodbarras}
              placeholder="Ex.: 7891234567890"
              style={[s.input, erros.codbarras && s.inputError]}
              autoCapitalize="none"
              keyboardType="numeric"
            />
            {erros.codbarras ? <Text style={s.errText}>{erros.codbarras}</Text> : null}

            <Text style={s.label}>nome *</Text>
            <TextInput
              value={nome}
              onChangeText={setNome}
              placeholder="Ex.: Ração Premium 20kg"
              style={[s.input, erros.nome && s.inputError]}
            />
            {erros.nome ? <Text style={s.errText}>{erros.nome}</Text> : null}

            <Text style={s.label}>quantidade *</Text>
            <TextInput
              value={quantidade}
              onChangeText={setQuantidade}
              placeholder="Ex.: 1"
              style={[s.input, erros.quantidade && s.inputError]}
              keyboardType="numeric"
            />
            {erros.quantidade ? <Text style={s.errText}>{erros.quantidade}</Text> : null}

            <View style={s.modalActions}>
              <TouchableOpacity onPress={() => setModalVisivel(false)} style={[s.btn, s.btnGhost]}>
                <Text style={s.btnTextGhost}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={salvarDoModal} style={[s.btn, s.btnPrimary]}>
                <Text style={s.btnTextPrimary}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal: confirmar excluir */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={s.backdrop}>
          <View style={[s.modalCard, { gap: 10 }]}>
            <Text style={s.modalTitle}>Excluir produto</Text>
            <Text style={{ fontSize: 14 }}>
              Tem certeza que deseja excluir{" "}
              <Text style={{ fontWeight: "700" }}>{targetNome}</Text>?
            </Text>
            <View style={s.modalActions}>
              <TouchableOpacity
                onPress={() => setConfirmVisible(false)}
                style={[s.btn, s.btnGhost]}
              >
                <Text style={s.btnTextGhost}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarExcluir} style={[s.btn, s.btnDanger]}>
                <Text style={s.btnTextDanger}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

/** Componente de KPI simples */
function KpiCard({
  label,
  value,
  hint,
  mono,
}: {
  label: string;
  value: string | number;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>
        {label} {hint ? <Text style={s.kpiHint}>{hint}</Text> : null}
      </Text>
      <Text style={[s.kpiValue, mono && s.kpiMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** Estilos */
const s = StyleSheet.create({
  hiddenInput: { position: "absolute", opacity: 0, height: 0, width: 0, zIndex: -1 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  readerBadge: { marginTop: 6, alignSelf: "flex-start", fontSize: 12, color: "#0a6", fontWeight: "700" },

  kpisRow: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: "#fff" },
  kpiCard: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#f4f4f4" },
  kpiLabel: { fontSize: 12, color: "#444", marginBottom: 6 },
  kpiHint: { color: "#777", fontSize: 12 },
  kpiValue: { fontSize: 20, fontWeight: "800" },
  kpiMono: { fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: "#fff" },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#fff",
  },
  lastBox: { maxWidth: 160, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: "#f6f6f6" },
  lastLabel: { fontSize: 10, color: "#666", marginBottom: 2 },
  lastValue: { fontSize: 12, fontWeight: "700" },

  sep: { height: StyleSheet.hairlineWidth, backgroundColor: "#eee", marginLeft: 12 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#fff" },
  colCod: { width: 72, paddingRight: 8 },
  codLabel: { fontSize: 10, color: "#888" },
  codValue: { fontSize: 12, color: "#222" },

  colInfo: { flex: 1, minWidth: 0 },
  codbarras: { fontSize: 14, fontWeight: "700", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },
  nome: { fontSize: 12, color: "#444" },

  colQty: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 8 },
  qtyBtn: { fontSize: 20, width: 26, textAlign: "center" },
  qtd: {
    minWidth: 28,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "700",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: "#f2f2f2",
  },

  delAction: { width: 96, justifyContent: "center", alignItems: "center", backgroundColor: "#d32f2f" },
  delText: { color: "#fff", fontWeight: "800" },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabIcon: { color: "#fff", fontSize: 28, marginTop: -2 },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", padding: 24, justifyContent: "center" },
  modalCard: { backgroundColor: "#fff", borderRadius: 14, padding: 16, gap: 8 },
  modalTitle: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  label: { fontSize: 12, color: "#444" },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, backgroundColor: "#fff" },
  inputError: { borderColor: "#e65" },
  errText: { color: "#e65", fontSize: 12, marginTop: 2 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 8 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
  btnGhost: { backgroundColor: "#f3f3f3" },
  btnPrimary: { backgroundColor: "#111" },
  btnDanger: { backgroundColor: "#d32f2f" },
  btnTextGhost: { color: "#333", fontWeight: "600" },
  btnTextPrimary: { color: "#fff", fontWeight: "700" },
  btnTextDanger: { color: "#fff", fontWeight: "700" },
});
