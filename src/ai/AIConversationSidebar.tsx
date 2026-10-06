import searchIcon from "../assets/third-party/Lucide.dev/icons/search.svg";
import settingsIcon from "../assets/third-party/Lucide.dev/icons/settings-2.svg";
import newChatIcon from "../assets/third-party/Lucide.dev/icons/message-square-plus.svg";
import recentIcon from "../assets/third-party/Lucide.dev/icons/messages-square.svg";
import conversationIcon from "../assets/third-party/Lucide.dev/icons/message-square.svg";
import editIcon from "../assets/third-party/Lucide.dev/icons/square-pen.svg";
import deleteIcon from "../assets/third-party/Lucide.dev/icons/trash.svg";
import type { AIConversationSummary } from "./types";

interface Props {
  conversations: AIConversationSummary[];
  selectedId: string;
  query: string;
  isGenerating: boolean;
  onQueryChange: (query: string) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
}

export function AIConversationSidebar({ conversations, selectedId, query, isGenerating, onQueryChange, onNewChat, onSelect, onRename, onDelete }: Props) {
  const filtered = conversations.filter((conversation) => conversation.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  return (
    <aside className="ai-conversation-sidebar" aria-label="Conversaciones de IA">
      <div className="ai-conversation-sidebar__toolbar">
        <label className="ai-conversation-sidebar__search">
          <img src={searchIcon} alt="" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar" aria-label="Buscar conversaciones" />
        </label>
        <button type="button" className="ai-icon-button" title="Ajustes (próximamente)" aria-label="Ajustes" disabled>
          <img src={settingsIcon} alt="" />
        </button>
      </div>

      <button type="button" className="ai-sidebar-action" onClick={onNewChat} disabled={isGenerating}>
        <img src={newChatIcon} alt="" />
        <span>Nuevo Chat</span>
      </button>

      <div className="ai-conversation-sidebar__divider" />
      <div className="ai-conversation-sidebar__heading">
        <img src={recentIcon} alt="" />
        <span>Conversaciones recientes</span>
      </div>
      <nav className="ai-conversation-sidebar__list" aria-label="Conversaciones recientes">
        {filtered.map((conversation) => (
          <div className="ai-conversation-sidebar__item" key={conversation.id}>
            <button type="button" className={conversation.id === selectedId ? "is-selected" : ""} onClick={() => onSelect(conversation.id)} disabled={isGenerating}>
              <img src={conversationIcon} alt="" />
              <span>{conversation.title}</span>
            </button>
            <button type="button" className="ai-icon-button" title="Renombrar" aria-label={`Renombrar ${conversation.title}`} onClick={() => onRename(conversation.id)} disabled={isGenerating}><img src={editIcon} alt="" /></button>
            <button type="button" className="ai-icon-button" title="Eliminar" aria-label={`Eliminar ${conversation.title}`} onClick={() => onDelete(conversation.id)} disabled={isGenerating}><img src={deleteIcon} alt="" /></button>
          </div>
        ))}
      </nav>
    </aside>
  );
}
