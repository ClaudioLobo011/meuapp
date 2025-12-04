import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { ProdutoCatalogo, STORAGE_CATALOGO } from "@/constants/catalogo";

type TabKey = "historico" | "produtos";

// Quantos itens carregar por vez
const PAGE_SIZE = 200;

export default function Inicio() {
  const [tab, setTab] = useState<TabKey>("historico");
  const [catalogo, setCatalogo] = useState<ProdutoCatalogo[]>([]);
  const [carregandoCatalogo, setCarregandoCatalogo] = useState(true);
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      setCarregandoCatalogo(true);
      setErroCatalogo(null);
      setVisibleCount(PAGE_SIZE);

      (async () => {
        try {
          const salvo = await AsyncStorage.getItem(STORAGE_CATALOGO);
          if (!ativo) return;

          if (!salvo) {
            setCatalogo([]);
            return;
          }

          try {
            const parsed = JSON.parse(salvo) as ProdutoCatalogo[];
            const lista = Array.isArray(parsed) ? parsed : [];
            setCatalogo(lista);
            setVisibleCount(Math.min(PAGE_SIZE, lista.length));
          } catch {
            setCatalogo([]);
            setErroCatalogo(
              "Falha ao ler o catálogo salvo. Importe novamente o arquivo."
            );
          }
        } catch {
          if (!ativo) return;
          setCatalogo([]);
          setErroCatalogo("Não foi possível carregar os produtos importados.");
        } finally {
          if (ativo) {
            setCarregandoCatalogo(false);
          }
        }
      })();

      return () => {
        ativo = false;
      };
    }, [])
  );

  // Carrega mais itens quando chega perto do final da lista
  const handleLoadMore = () => {
    if (visibleCount >= catalogo.length) return;
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, catalogo.length));
  };

  const renderProduto = ({ item }: { item: ProdutoCatalogo }) => {
    return (
      <View style={s.produtoItem}>
        <Text style={s.produtoNome}>{item.nome}</Text>
        <Text style={s.produtoCodigo}>
          Código: {item.cod || "—"}
        </Text>
        <Text style={s.produtoCodigo}>Cod. barras: {item.codbarras}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container}>
      {/* Cabeçalho */}
      <View style={s.header}>
        <Text style={s.headerTitle}>LobosTi Contagem</Text>
      </View>

      {/* Abas internas */}
      <View style={s.tabsRow}>
        <TabButton
          label="Historico"
          active={tab === "historico"}
          onPress={() => setTab("historico")}
        />
        <TabButton
          label="Produtos"
          active={tab === "produtos"}
          onPress={() => setTab("produtos")}
        />
      </View>

      {/* Conteúdo da aba selecionada */}
      <View style={s.content}>
        {tab === "historico" ? (
          <View style={s.center}>
            <Text style={s.placeholder}>Sem histórico ainda.</Text>
            <Text style={s.hint}>
              As contagens aparecerão aqui quando forem salvas.
            </Text>
          </View>
        ) : (
          <View style={s.flex}>
            {carregandoCatalogo ? (
              <View style={s.center}>
                <ActivityIndicator size="small" color="#111" />
                <Text style={s.hint}>Carregando catálogo importado…</Text>
              </View>
            ) : erroCatalogo ? (
              <View style={s.center}>
                <Text style={s.placeholder}>{erroCatalogo}</Text>
                <Text style={s.hint}>
                  Volte em Configurações e importe novamente o arquivo.
                </Text>
              </View>
            ) : catalogo.length === 0 ? (
              <View style={s.center}>
                <Text style={s.placeholder}>Nenhum produto importado.</Text>
                <Text style={s.hint}>
                  Use a aba Configurações &gt; Importar Produtos para carregar
                  o catálogo.
                </Text>
              </View>
            ) : (
              <>
                <View style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                  <Text style={s.hint}>
                    Total de produtos: {catalogo.length} | mostrando{" "}
                    {visibleCount} itens
                  </Text>
                </View>

                <FlatList
                  data={catalogo.slice(0, visibleCount)}
                  keyExtractor={(item, index) =>
                    item.codbarras || item.cod || String(index)
                  }
                  renderItem={renderProduto}
                  contentContainerStyle={s.listContent}
                  onEndReached={handleLoadMore}
                  onEndReachedThreshold={0.4}
                  initialNumToRender={30}
                  maxToRenderPerBatch={30}
                  windowSize={11}
                  removeClippedSubviews
                  ListFooterComponent={
                    visibleCount < catalogo.length ? (
                      <View
                        style={{
                          paddingVertical: 16,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <ActivityIndicator size="small" color="#111" />
                        <Text style={s.hint}>
                          Carregando mais produtos…
                        </Text>
                      </View>
                    ) : null
                  }
                />
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.tabBtn, active && s.tabBtnActive]}
      onPress={onPress}
    >
      <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#ddd",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  tabsRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#eee",
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#f2f2f2",
  },
  tabBtnActive: { backgroundColor: "#111" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#333" },
  tabTextActive: { color: "#fff" },
  content: { flex: 1, padding: 16 },
  flex: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  placeholder: { fontSize: 16, fontWeight: "600" },
  hint: { fontSize: 12, color: "#666" },
  listContent: { paddingBottom: 24, gap: 12 },
  produtoItem: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: "#f4f4f4",
    gap: 4,
  },
  produtoNome: { fontSize: 15, fontWeight: "700", color: "#111" },
  produtoCodigo: { fontSize: 12, color: "#444" },
});
