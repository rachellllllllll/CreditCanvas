import React, { useState } from 'react';
import type { CreditDetail } from '../types';
import './TransactionsChat.css';

interface TransactionsChatProps {
  details: CreditDetail[];
  showClearChatButton?: boolean; // שליטה חיצונית על כפתור ניקוי
}

const TransactionsChat: React.FC<TransactionsChatProps> = ({ details, showClearChatButton = true }) => {
  // State for expanded messages
  const [expandedMessages, setExpandedMessages] = useState<{ [key: number]: boolean }>({});

  // Helper: split long message and add 'show more'
  const renderMessageContent = (msg: { content: string }, idx: number) => {
    const MAX_LENGTH = 350;
    const isLong = msg.content.length > MAX_LENGTH;
    const expanded = expandedMessages[idx];
    if (!isLong) return msg.content;
    return (
      <>
        {expanded ? msg.content : msg.content.slice(0, MAX_LENGTH) + '...'}
        <button
          className="show-more-btn"
          style={{ marginRight: 8, fontSize: '0.9em', background: 'none', border: 'none', color: '#1976d2', cursor: 'pointer' }}
          onClick={() => setExpandedMessages(prev => ({ ...prev, [idx]: !expanded }))}
        >
          {expanded ? 'הצג פחות' : 'הצג עוד'}
        </button>
      </>
    );
  };
  // שמור היסטוריית צ'אט ב-localStorage
  const CHAT_HISTORY_KEY = 'transactionsChatHistory';
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: number, questionSummary?: string, answerSummary?: string }>>(() => {
    try {
      const saved = localStorage.getItem(CHAT_HISTORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore localStorage errors */ }
    return [];
  });
  // שמור היסטוריית צ'אט בכל שינוי
  React.useEffect(() => {
    try {
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
    } catch { /* ignore localStorage errors */ }
  }, [messages]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Replace this with your backend API endpoint
  const API_URL = '/api/llm-chat';

  // Helper: apply advanced filter condition to details
  interface TransactionFilter {
    category?: string | string[];
    amount?: { lte?: number; gte?: number; gt?: number; lt?: number };
    date?: { gte?: string; lte?: string };
    description?: { contains?: string };
    sortBy?: keyof CreditDetail;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    fieldsOfInterest?: (keyof CreditDetail)[];
  }
  const applyAdvancedFilter = (details: CreditDetail[], filter: TransactionFilter): (CreditDetail | Partial<CreditDetail>)[] => {
    if (!filter || !Array.isArray(details)) return details;
    // Helper to parse date string as YYYY-MM-DD for comparison
    const parseDate = (dateStr: string) => {
      // Accepts dd/mm/yyyy or dd/mm/yy
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        let year = parts[2];
        if (year.length === 2) year = '20' + year;
        return `${year}-${month}-${day}`;
      }
      return dateStr;
    };
    let filtered = details.filter(item => {
      // Filter by category
      if (filter.category && item.category !== filter.category && (!Array.isArray(filter.category) || !filter.category.includes(item.category ?? ''))) {
        return false;
      }
      // Filter by amount
      if (filter.amount) {
        if (filter.amount.lte !== undefined && !(item.amount <= filter.amount.lte)) return false;
        if (filter.amount.gte !== undefined && !(item.amount >= filter.amount.gte)) return false;
        if (filter.amount.gt !== undefined && !(item.amount > filter.amount.gt)) return false;
        if (filter.amount.lt !== undefined && !(item.amount < filter.amount.lt)) return false;
      }
      // Filter by date (supports gte/lte)
      if (filter.date) {
        const itemDate = parseDate(item.date);
        if (filter.date.gte) {
          const gteDate = parseDate(filter.date.gte);
          if (itemDate < gteDate) return false;
        }
        if (filter.date.lte) {
          const lteDate = parseDate(filter.date.lte);
          if (itemDate > lteDate) return false;
        }
      }
      // Filter by description
      if (filter.description && typeof item.description === 'string') {
        if (filter.description.contains && typeof filter.description.contains === 'string') {
          // Normalize multiple spaces to one and compare case-insensitive
          const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
          if (!norm(item.description).includes(norm(filter.description.contains))) return false;
        }
      }
      // Add more fields as needed
      return true;
    });

    // Sorting support
    if (filter.sortBy) {
      const dir = filter.sortOrder === 'desc' ? -1 : 1;
      filtered = filtered.slice().sort((a, b) => {
        const key = filter.sortBy as keyof typeof a;
        const valA = a[key];
        const valB = b[key];
        if (typeof valA === 'string' && typeof valB === 'string') {
          return valA.localeCompare(valB) * dir;
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * dir;
        }
        return 0;
      });
    }
    // Limit support
    if (typeof filter.limit === 'number' && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    // If fieldsOfInterest is provided, map each transaction to only those fields
    if (Array.isArray(filter.fieldsOfInterest) && filter.fieldsOfInterest.length > 0) {
      const fields = filter.fieldsOfInterest;
      return filtered.map(item => {
        const obj: Partial<CreditDetail> = {};
        fields.forEach((field) => {
          if (field in item) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (obj as any)[field] = item[field];
          }
        });
        return obj;
      });
    }
    return filtered;
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const now = Date.now();
    setMessages(prev => [...prev, { role: 'user', content: input, timestamp: now }]);
    setLoading(true);
    try {
      // Step 1: build categories summary
      const categoryMap = new Map<string, { name: string; sum: number; count: number }>();
      details.forEach(tx => {
        const cat = tx.category || 'ללא קטגוריה';
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { name: cat, sum: 0, count: 0 });
        }
        const obj = categoryMap.get(cat)!;
        obj.sum += tx.amount;
        obj.count += 1;
      });
      const categories = Array.from(categoryMap.values());

      // Step 2: build sample transactions (up to 2 per category)
      const samples: CreditDetail[] = [];
      for (const cat of categoryMap.keys()) {
        const txs = details.filter(tx => (tx.category || 'ללא קטגוריה') === cat).slice(0, 2);
        samples.push(...txs);
      }

      // Step 3: build summaries array from previous messages
      const summaries = messages
        .filter(m => m.questionSummary && m.answerSummary)
        .slice(-5)
        .map(m => ({ questionSummary: m.questionSummary, answerSummary: m.answerSummary }));

      // Step 4: send to backend with summaries
      const filterResponse = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input, categories, samples, summaries }),
      });
      const filterData = await filterResponse.json();
      const { relevantCategories, transactionFilter } = filterData;

      // Step 5: filter details on client
      let filteredDetails: (CreditDetail | Partial<CreditDetail>)[] = details;
      if (transactionFilter) {
        filteredDetails = applyAdvancedFilter(details, transactionFilter);
      } else if (Array.isArray(relevantCategories) && relevantCategories.length > 0) {
        filteredDetails = details.filter(tx => relevantCategories.includes(tx.category));
      }

      // Step 6: get final answer from backend with filtered details and summaries
      const answerResponse = await fetch('/api/llm-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: input, details: filteredDetails, summaries }),
      });
      const answerData = await answerResponse.json();
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: answerData.answer,
          timestamp: Date.now(),
          questionSummary: answerData.questionSummary,
          answerSummary: answerData.answerSummary,
        },
      ]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'שגיאה בשליחת השאלה לשרת.', timestamp: Date.now() }]);
    }
    setInput('');
    setLoading(false);
  }

  // גלילה אוטומטית לתחתית הצ'אט
  React.useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // שליחה ב-Enter
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !loading && input.trim()) {
      handleSend();
    }
  };

  // עיצוב תאריך/שעה
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // פונקציה לניקוי הצ'אט
  const handleClearChat = () => {
    setMessages([]);
    try { localStorage.removeItem(CHAT_HISTORY_KEY); } catch { /* ignore */ }
  };

  return (
    <div className="transactions-chat-container upgraded-ui">
      { showClearChatButton && messages.length > 0 && (
        <div className="transactions-chat-header-row">
          <button className="clear-chat-btn" onClick={handleClearChat} title="נקה צ'אט">
            🗑️ נקה צ'אט
          </button>
        </div>
      )}
      <div className="transactions-chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`transactions-chat-message-bubble ${msg.role}`}>  
            <div className="chat-avatar">
              {msg.role === 'user' ? (
                <span role="img" aria-label="user">🧑</span>
              ) : (
                <span role="img" aria-label="assistant">🤖</span>
              )}
            </div>
            <div className="chat-bubble-content">
              {msg.role === 'assistant'
                ? renderMessageContent(msg, idx)
                : msg.content}
              <span className="msg-meta">{formatTime(msg.timestamp)}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="transactions-chat-message-bubble assistant">
            <div className="chat-avatar"><span role="img" aria-label="assistant">🤖</span></div>
            <div className="chat-bubble-content">
              <span className="transactions-chat-spinner">
                <span className="loader"></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="transactions-chat-input-row upgraded-input-row">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="הקלד שאלה על העסקאות..."
          disabled={loading}
          className="transactions-chat-input upgraded-input"
          onKeyDown={handleInputKeyDown}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()} className="transactions-chat-send-btn upgraded-send-btn">
          <span role="img" aria-label="send">📤</span>
        </button>
      </div>
    </div>
  );
};

export default TransactionsChat;
