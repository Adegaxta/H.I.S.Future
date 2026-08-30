import React, { useState, useRef, useCallback } from "react";

const TYPE_COLOR = {
  categoria: "#D8B34D",
  pagina: "#4DD8C0",
};

const TYPE_LABEL = {
  categoria: "CATEGORÍA",
  pagina: "PÁGINA",
};

let nextId = 1;

export default function App() {
  const [width, setWidth] = useState(260);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [view, setView] = useState("list");
  const [nodes, setNodes] = useState([]); // {id, name, type, parentId}
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [creating, setCreating] = useState(null); // { parentId } while form open
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState("pagina");
  const [dragOverId, setDragOverId] = useState(undefined);
  const dragging = useRef(false);
  const draggedId = useRef(null);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = "col-resize";
  }, []);
  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "default";
  }, []);
  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    setWidth(Math.min(420, Math.max(200, e.clientX)));
  }, []);
  React.useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const openCreate = (parentId) => {
    setCreating({ parentId });
    setDraftName("");
    setDraftType("pagina");
  };

  const confirmCreate = () => {
    if (!draftName.trim()) return;
    const id = nextId++;
    setNodes((prev) => [
      ...prev,
      { id, name: draftName.trim(), type: draftType, parentId: creating.parentId },
    ]);
    if (creating.parentId != null) {
      setExpanded((prev) => ({ ...prev, [creating.parentId]: true }));
    }
    setCreating(null);
    if (draftType === "pagina") setSelectedId(id);
  };

  const handleDrop = (targetId) => {
    if (draggedId.current == null) return;
    if (draggedId.current === targetId) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === draggedId.current ? { ...n, parentId: targetId } : n
      )
    );
    setDragOverId(undefined);
    if (targetId != null) setExpanded((prev) => ({ ...prev, [targetId]: true }));
  };

  const rootNodes = nodes.filter((n) => n.parentId == null);
  const childrenOf = (id) => nodes.filter((n) => n.parentId === id);
  const selectedNode = nodes.find((n) => n.id === selectedId);

  const renderNode = (node, depth) => {
    const children = childrenOf(node.id);
    const isExpanded = expanded[node.id];
    const isSelected = node.id === selectedId;
    const isDragOver = dragOverId === node.id;

    return (
      <div key={node.id}>
        <div
          draggable
          onDragStart={() => (draggedId.current = node.id)}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverId(node.id);
          }}
          onDragLeave={() => setDragOverId(undefined)}
          onDrop={(e) => {
            e.preventDefault();
            handleDrop(node.id);
          }}
          onClick={() => {
            if (node.type === "categoria") {
              setExpanded((prev) => ({ ...prev, [node.id]: !prev[node.id] }));
            } else {
              setSelectedId(node.id);
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "6px 8px",
            marginLeft: `${depth * 14}px`,
            borderRadius: "3px",
            cursor: "pointer",
            background: isSelected
              ? "#1E2226"
              : isDragOver
              ? "#1A2926"
              : "transparent",
            borderLeft: isSelected
              ? "2px solid #4DD8C0"
              : "2px solid transparent",
            outline: isDragOver ? "1px dashed #4DD8C0" : "none",
          }}
          onMouseEnter={(e) => {
            if (!isSelected && !isDragOver)
              e.currentTarget.style.background = "#191C20";
          }}
          onMouseLeave={(e) => {
            if (!isSelected && !isDragOver)
              e.currentTarget.style.background = "transparent";
          }}
        >
          {node.type === "categoria" && (
            <span
              style={{
                fontSize: "9px",
                color: "#5A5F66",
                width: "10px",
                display: "inline-block",
              }}
            >
              {isExpanded ? "▾" : "▸"}
            </span>
          )}
          {node.type === "pagina" && <span style={{ width: "10px" }} />}
          <span
            style={{
              fontSize: "13px",
              color: isSelected ? "#F2F3F4" : "#C7C9CC",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {node.name}
          </span>
          <span
            onClick={(e) => {
              e.stopPropagation();
              openCreate(node.id);
            }}
            style={{
              fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
              fontSize: "12px",
              color: "#4A4E54",
              padding: "0 4px",
            }}
            title="Crear nodo dentro"
          >
            +
          </span>
        </div>
        {node.type === "categoria" && isExpanded && (
          <div>
            {children.map((c) => renderNode(c, depth + 1))}
            {creating && creating.parentId === node.id && (
              <div style={{ marginLeft: `${(depth + 1) * 14}px` }}>
                {renderCreateForm()}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderCreateForm = () => (
    <div
      style={{
        padding: "8px",
        margin: "4px 0",
        background: "#1A1D21",
        border: "1px solid #2A2E33",
        borderRadius: "4px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      <input
        autoFocus
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirmCreate();
          if (e.key === "Escape") setCreating(null);
        }}
        placeholder="Nombre del nodo..."
        style={{
          background: "#121417",
          border: "1px solid #2A2E33",
          borderRadius: "3px",
          padding: "6px 8px",
          fontSize: "12px",
          color: "#E8E9EA",
          outline: "none",
        }}
      />
      <div style={{ display: "flex", gap: "4px" }}>
        {["pagina", "categoria"].map((t) => (
          <button
            key={t}
            onClick={() => setDraftType(t)}
            style={{
              fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
              fontSize: "9px",
              letterSpacing: "0.08em",
              padding: "5px 8px",
              borderRadius: "3px",
              border: "1px solid",
              borderColor: draftType === t ? TYPE_COLOR[t] : "#2A2E33",
              color: draftType === t ? TYPE_COLOR[t] : "#5A5F66",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <button
          onClick={confirmCreate}
          style={{
            marginLeft: "auto",
            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
            fontSize: "9px",
            letterSpacing: "0.08em",
            padding: "5px 10px",
            borderRadius: "3px",
            border: "1px solid #4DD8C0",
            color: "#4DD8C0",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          CREAR
        </button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100%",
        background: "#121417",
        fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif',
        color: "#E8E9EA",
        overflow: "hidden",
      }}
    >
      {/* TOP BAR */}
      <div
        style={{
          height: "40px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px 0 14px",
          background: "#16181C",
          borderBottom: "1px solid #23262B",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            onClick={() => setSidebarVisible((v) => !v)}
            title="Mostrar / ocultar panel"
            style={{
              fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
              fontSize: "12px",
              color: "#5A5F66",
              cursor: "pointer",
              padding: "4px 6px",
            }}
          >
            {sidebarVisible ? "◧" : "◨"}
          </span>
          <div style={{ display: "flex", gap: "4px" }}>
            {["list", "graph"].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                  fontSize: "10px",
                  letterSpacing: "0.1em",
                  color: view === v ? "#4DD8C0" : "#5A5F66",
                  background: view === v ? "#1E2226" : "transparent",
                  border: "none",
                  borderRadius: "3px",
                  padding: "5px 10px",
                  cursor: "pointer",
                }}
              >
                {v === "list" ? "LISTA" : "GRAFO"}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
            fontSize: "9px",
            letterSpacing: "0.1em",
            color: "#3E4247",
          }}
        >
          v0.1 — PROTOTIPO
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        {sidebarVisible && (
          <div
            style={{
              width: `${width}px`,
              flexShrink: 0,
              background: "#16181C",
              borderRight: "1px solid #23262B",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* PROJECT HEADER */}
            <div
              style={{
                padding: "14px",
                borderBottom: "1px solid #1F2226",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "14px",
                    color: "#F2F3F4",
                    marginBottom: "2px",
                  }}
                >
                  LORE
                </div>
                <div
                  style={{
                    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                    fontSize: "9px",
                    letterSpacing: "0.1em",
                    color: "#4A4E54",
                  }}
                >
                  {nodes.length} NODOS
                </div>
              </div>
              <span
                onClick={() => setSidebarVisible(false)}
                title="Ocultar panel"
                style={{
                  fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                  fontSize: "11px",
                  color: "#4A4E54",
                  cursor: "pointer",
                  padding: "4px",
                }}
              >
                «
              </span>
            </div>

            {/* NODE TREE */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverId(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(null);
              }}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px",
                background:
                  dragOverId === null && draggedId.current != null
                    ? "#151719"
                    : "transparent",
              }}
            >
              {nodes.length === 0 && !creating ? (
                <div
                  style={{
                    padding: "18px 10px",
                    fontSize: "12px",
                    color: "#5A5F66",
                    lineHeight: "1.6",
                  }}
                >
                  Todavía no hay nada aquí.
                  <div
                    onClick={() => openCreate(null)}
                    style={{
                      marginTop: "8px",
                      color: "#4DD8C0",
                      cursor: "pointer",
                      fontFamily:
                        'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                      fontSize: "10px",
                      letterSpacing: "0.06em",
                    }}
                  >
                    + CREAR PRIMER NODO
                  </div>
                </div>
              ) : (
                <>
                  {rootNodes.map((n) => renderNode(n, 0))}
                  {creating && creating.parentId === null && renderCreateForm()}
                </>
              )}
            </div>

            {nodes.length > 0 && (
              <div
                onClick={() => openCreate(null)}
                style={{
                  padding: "10px 14px",
                  borderTop: "1px solid #1F2226",
                  fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                  fontSize: "10px",
                  letterSpacing: "0.08em",
                  color: "#4A4E54",
                  cursor: "pointer",
                }}
              >
                + NUEVO NODO RAÍZ
              </div>
            )}
          </div>
        )}

        {sidebarVisible && (
          <div
            onMouseDown={onMouseDown}
            style={{ width: "4px", cursor: "col-resize", flexShrink: 0 }}
          />
        )}

        {/* MAIN CONTENT */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            backgroundImage:
              "linear-gradient(#1A1D21 1px, transparent 1px), linear-gradient(90deg, #1A1D21 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            backgroundPosition: "-1px -1px",
          }}
        >
          {!selectedNode && (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#4A4E54" }}>
                {nodes.length === 0
                  ? "Ningún nodo creado todavía."
                  : "Selecciona una página en el panel."}
              </div>
              {nodes.length === 0 && (
                <div
                  onClick={() => openCreate(null)}
                  style={{
                    color: "#4DD8C0",
                    cursor: "pointer",
                    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                    fontSize: "10px",
                    letterSpacing: "0.06em",
                  }}
                >
                  + CREAR PRIMER NODO
                </div>
              )}
            </div>
          )}

          {selectedNode && (
            <>
              <div
                style={{
                  height: "140px",
                  background: "linear-gradient(135deg, #1A2422 0%, #16181C 60%)",
                  borderBottom: "1px solid #23262B",
                  position: "relative",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: "0 36px",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "14px",
                    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                    fontSize: "9px",
                    letterSpacing: "0.08em",
                    color: "#4A4E54",
                    cursor: "pointer",
                  }}
                >
                  CAMBIAR PORTADA
                </span>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "8px",
                    background: "#1E2226",
                    border: "1px solid #2A2E33",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: "translateY(32px)",
                    fontSize: "22px",
                    color: TYPE_COLOR[selectedNode.type],
                    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                  }}
                >
                  {selectedNode.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <div style={{ padding: "48px 36px 28px 36px" }}>
                <div
                  style={{
                    fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", monospace',
                    fontSize: "10px",
                    letterSpacing: "0.14em",
                    color: TYPE_COLOR[selectedNode.type],
                    marginBottom: "8px",
                  }}
                >
                  {TYPE_LABEL[selectedNode.type]}
                </div>
                <h1
                  style={{
                    fontSize: "26px",
                    fontWeight: 500,
                    margin: "0 0 20px 0",
                    color: "#F2F3F4",
                  }}
                >
                  {selectedNode.name}
                </h1>
                <div
                  style={{
                    border: "1px solid #23262B",
                    borderRadius: "4px",
                    padding: "18px",
                    background: "#151719",
                    color: "#7A7F87",
                    fontSize: "13px",
                    lineHeight: "1.6",
                  }}
                >
                  Espacio para el contenido de este nodo. Aquí va el editor de
                  texto enriquecido, campos custom y relaciones con otros
                  nodos.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
