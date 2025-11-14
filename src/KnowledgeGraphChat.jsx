import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Network, X, Loader2, ChevronRight } from 'lucide-react';

const KnowledgeGraphChat = () => {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [conversations, setConversations] = useState({});
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [sidePanel, setSidePanel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const tooltipCacheRef = useRef({});
  const [tooltipLoading, setTooltipLoading] = useState(false);
  const graphRef = useRef(null);

  // Initialize with root conversation
  useEffect(() => {
    const rootId = 'root';
    setNodes([{ 
      id: rootId, 
      label: 'Start your learning journey', 
      x: 100, 
      y: 300,
      type: 'root' // root, main, or sub
    }]);
    setConversations({ [rootId]: [] });
    setActiveNodeId(rootId);
  }, []);

  const callClaude = async (messages) => {
    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: messages,
          max_tokens: 2000
        })
      });
      const data = await response.json();
      return data.content[0].text;
    } catch (error) {
      console.error("Error calling Claude:", error);
      return "Sorry, I encountered an error processing your request.";
    }
  };

  const getQuickExplanation = useCallback(async (term) => {
    // Check cache first using ref
    if (tooltipCacheRef.current[term]) {
      return tooltipCacheRef.current[term];
    }

    setTooltipLoading(true);
    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Provide a brief, one-sentence explanation of: ${term}`
          }],
          max_tokens: 150
        })
      });
      const data = await response.json();
      const explanation = data.content[0].text;
      
      // Cache the result in ref
      tooltipCacheRef.current[term] = explanation;
      setTooltipLoading(false);
      return explanation;
    } catch (error) {
      console.error("Error getting explanation:", error);
      setTooltipLoading(false);
      return "Unable to fetch explanation.";
    }
  }, []); // No dependencies needed since we use ref

  const sendMessage = async (nodeId, userMessage, skipMainChildCreation = false) => {
    const currentConvo = conversations[nodeId] || [];
    const newUserMsg = { role: 'user', content: userMessage };
    
    // Update conversation with user message
    setConversations(prev => ({
      ...prev,
      [nodeId]: [...currentConvo, newUserMsg]
    }));

    setLoading(true);

    // Call Claude with full conversation history
    const response = await callClaude([...currentConvo, newUserMsg]);

    // Update conversation with assistant response
    setConversations(prev => ({
      ...prev,
      [nodeId]: [...prev[nodeId], { role: 'assistant', content: response }]
    }));
    
    // If it's the first message, update the node label
    if (currentConvo.length === 0) {
      setNodes(prev => prev.map(n => 
        n.id === nodeId ? { ...n, label: userMessage.substring(0, 40) } : n
      ));
    }
    // REMOVED: automatic node switching - users stay in current conversation

    setLoading(false);
  };

  const createBranch = (parentNodeId, selectedText) => {
    const newNodeId = `sub_${Date.now()}`;
    const parentNode = nodes.find(n => n.id === parentNodeId);
    
    // Find how many subChildren this parent already has
    const subChildren = edges
      .filter(e => e.from === parentNodeId && e.type === 'sub')
      .map(e => nodes.find(n => n.id === e.to));
    
    // Position subchildren below parent, spread horizontally
    const offset = (subChildren.length - 1) * 120;
    const newX = parentNode.x + offset;
    const newY = parentNode.y + 150;

    // Create new subChild node
    const newNode = {
      id: newNodeId,
      label: selectedText.substring(0, 40),
      x: newX,
      y: newY,
      type: 'sub'
    };

    setNodes(prev => [...prev, newNode]);
    setEdges(prev => [...prev, { 
      from: parentNodeId, 
      to: newNodeId, 
      type: 'sub' 
    }]);
    setConversations(prev => ({ ...prev, [newNodeId]: [] }));

    // Open side panel with the branch
    setSidePanel({
      nodeId: newNodeId,
      parentNodeId: parentNodeId,
      initialQuestion: `What is ${selectedText}?`
    });

    // Send initial question
    sendMessage(newNodeId, `What is ${selectedText}?`);
  };

  const TextWithSelection = ({ text, onSelectionChange }) => {
    const handleMouseUp = () => {
      setTimeout(() => {
        const selectedText = window.getSelection().toString().trim();
        
        if (selectedText && selectedText.length > 0) {
          const range = window.getSelection().getRangeAt(0);
          const rect = range.getBoundingClientRect();
          onSelectionChange(selectedText, rect);
        }
      }, 10);
    };

    return (
      <div 
        onMouseUp={handleMouseUp}
        className="whitespace-pre-wrap cursor-text select-text"
      >
        {text}
      </div>
    );
  };

  const ChatInterface = ({ nodeId, isMain = false }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);
    const conversation = conversations[nodeId] || [];
    const prevConversationLengthRef = useRef(0);
    
    // Move selection state to parent level to avoid conflicts between multiple TextWithSelection components
    const [activeSelection, setActiveSelection] = useState(null);
    const [selectionRect, setSelectionRect] = useState(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipContent, setTooltipContent] = useState('');
    const selectionRef = useRef(null);
    const showTooltipRef = useRef(false);

    useEffect(() => {
      // Only scroll if conversation length increased (new message added)
      if (conversation.length > prevConversationLengthRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
      prevConversationLengthRef.current = conversation.length;
    }, [conversation]);
    
    // Update tooltip ref when state changes
    useEffect(() => {
      showTooltipRef.current = showTooltip;
    }, [showTooltip]);
    
    // Fetch tooltip explanation
    const fetchTooltip = useCallback(async (text) => {
      setShowTooltip(true);
      setTooltipContent('');
      
      const explanation = await getQuickExplanation(text);
      setTooltipContent(explanation);
    }, [getQuickExplanation]);
    
    // Keyboard handler for Command/Option
    useEffect(() => {
      const handleKeyDown = (e) => {
        if (e.altKey || e.metaKey) {
          e.preventDefault();
          e.stopPropagation();
          
          const storedSelection = selectionRef.current;
          
          if (storedSelection && !showTooltipRef.current) {
            fetchTooltip(storedSelection);
          }
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [fetchTooltip]);
    
    // Clear selection when clicking outside
    useEffect(() => {
      const handleClickOutside = () => {
        if (!window.getSelection().toString().trim()) {
          setActiveSelection(null);
          setSelectionRect(null);
          selectionRef.current = null;
          setShowTooltip(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleSelectionChange = (text, rect) => {
      setActiveSelection(text);
      setSelectionRect(rect);
      selectionRef.current = text;
      setShowTooltip(false);
      setTooltipContent('');
    };
    
    const handleCreateBranch = () => {
      if (activeSelection) {
        createBranch(nodeId, activeSelection);
        setActiveSelection(null);
        setSelectionRect(null);
        selectionRef.current = null;
        setShowTooltip(false);
        window.getSelection().removeAllRanges();
      }
    };
    
    const handleSend = () => {
      if (input.trim() && !loading) {
        sendMessage(nodeId, input);
        setInput('');
      }
    };

    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {conversation.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <TextWithSelection 
                    text={msg.content} 
                    onSelectionChange={handleSelectionChange}
                  />
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          {loading && nodeId === activeNodeId && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg p-3">
                <Loader2 className="animate-spin" size={20} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* Tooltip for quick explanations */}
        {activeSelection && showTooltip && selectionRect && (
          <div
            className="fixed z-50 bg-gray-900 text-white px-3 py-2 rounded-lg shadow-xl max-w-sm text-sm"
            style={{
              left: `${selectionRect.left + selectionRect.width / 2}px`,
              top: `${selectionRect.top - 10}px`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <button
              onClick={() => {
                setShowTooltip(false);
                setActiveSelection(null);
                selectionRef.current = null;
              }}
              className="absolute top-1 right-1 text-gray-400 hover:text-white"
              aria-label="Close"
            >
              <X size={14} />
            </button>
            
            {tooltipLoading || !tooltipContent ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={14} />
                <span>Loading explanation...</span>
              </div>
            ) : (
              <>
                <div className="font-semibold mb-1 text-yellow-300">{activeSelection}</div>
                <div className="text-gray-300">{tooltipContent}</div>
              </>
            )}
            <div
              className="absolute left-1/2 transform -translate-x-1/2 bottom-0 translate-y-full"
              style={{
                width: 0,
                height: 0,
                borderLeft: '6px solid transparent',
                borderRight: '6px solid transparent',
                borderTop: '6px solid #111827'
              }}
            />
          </div>
        )}
        
        {/* Selection popup for creating branches */}
        {activeSelection && !showTooltip && selectionRect && (
          <div
            className="fixed z-40 flex flex-col gap-1"
            style={{
              left: `${selectionRect.left + selectionRect.width / 2}px`,
              top: `${selectionRect.top - 10}px`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <button
              onClick={handleCreateBranch}
              className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm shadow-lg hover:bg-blue-700 flex items-center gap-2 whitespace-nowrap"
            >
              <Network size={14} />
              Deep dive: "{activeSelection.substring(0, 20)}{activeSelection.length > 20 ? '...' : ''}"
            </button>
            <div className="text-xs text-gray-600 text-center bg-white px-2 py-1 rounded shadow">
              Press ⌘/⌥ for quick explanation
            </div>
          </div>
        )}

        <div className="border-t p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message..."
              className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  };

  const GraphVisualization = () => {
    return (
      <div className="w-full h-full bg-gray-50 relative overflow-auto" ref={graphRef}>
        <svg width="100%" height="700" className="min-w-[1200px]">
          {/* Draw edges */}
          {edges.map((edge, idx) => {
            const fromNode = nodes.find(n => n.id === edge.from);
            const toNode = nodes.find(n => n.id === edge.to);
            if (!fromNode || !toNode) return null;
            
            const isMainEdge = edge.type === 'main';
            const isSubEdge = edge.type === 'sub';
            
            return (
              <g key={idx}>
                <line
                  x1={fromNode.x}
                  y1={fromNode.y}
                  x2={toNode.x}
                  y2={toNode.y}
                  stroke={isMainEdge ? '#3b82f6' : '#a855f7'}
                  strokeWidth={isMainEdge ? '3' : '2'}
                  strokeDasharray={isSubEdge ? '5,5' : '0'}
                  markerEnd={isMainEdge ? 'url(#arrowMain)' : 'url(#arrowSub)'}
                />
              </g>
            );
          })}

          {/* Arrow markers */}
          <defs>
            <marker
              id="arrowMain"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#3b82f6" />
            </marker>
            <marker
              id="arrowSub"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L0,6 L9,3 z" fill="#a855f7" />
            </marker>
          </defs>

          {/* Draw nodes */}
          {nodes.map((node) => {
            const isRoot = node.type === 'root';
            const isMain = node.type === 'main';
            const isSub = node.type === 'sub';
            const isActive = activeNodeId === node.id;
            
            let fillColor = '#e2e8f0';
            let strokeColor = '#94a3b8';
            
            if (isActive) {
              fillColor = isRoot ? '#fbbf24' : isMain ? '#3b82f6' : '#a855f7';
              strokeColor = isRoot ? '#f59e0b' : isMain ? '#1d4ed8' : '#7c3aed';
            } else {
              fillColor = isRoot ? '#fef3c7' : isMain ? '#dbeafe' : '#f3e8ff';
              strokeColor = isRoot ? '#fbbf24' : isMain ? '#93c5fd' : '#d8b4fe';
            }
            
            return (
              <g key={node.id} onClick={() => setActiveNodeId(node.id)}>
                {isRoot ? (
                  <rect
                    x={node.x - 40}
                    y={node.y - 25}
                    width="80"
                    height="50"
                    rx="8"
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth="3"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  />
                ) : (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={isSub ? "25" : "30"}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth="2"
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                  />
                )}
                <text
                  x={node.x}
                  y={node.y + (isRoot ? 65 : 45)}
                  textAnchor="middle"
                  className="text-xs fill-gray-700 pointer-events-none font-medium"
                  style={{ maxWidth: '120px' }}
                >
                  {node.label.length > 35 ? node.label.substring(0, 35) + '...' : node.label}
                </text>
              </g>
            );
          })}

          {/* Legend */}
          <g transform="translate(20, 20)">
            <rect x="0" y="0" width="200" height="120" fill="white" stroke="#cbd5e1" strokeWidth="1" rx="4" />
            <text x="10" y="20" className="text-sm font-bold fill-gray-800">Legend</text>
            
            <rect x="10" y="30" width="30" height="20" rx="4" fill="#fef3c7" stroke="#fbbf24" strokeWidth="2" />
            <text x="45" y="44" className="text-xs fill-gray-700">Root Topic</text>
            
            <circle cx="25" cy="65" r="10" fill="#dbeafe" stroke="#93c5fd" strokeWidth="2" />
            <text x="45" y="70" className="text-xs fill-gray-700">Main Follow-up</text>
            
            <circle cx="25" cy="90" r="8" fill="#f3e8ff" stroke="#d8b4fe" strokeWidth="2" />
            <text x="45" y="95" className="text-xs fill-gray-700">Deep Dive</text>
          </g>
        </svg>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-white">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        <div className="bg-gray-800 text-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle size={24} />
              <h1 className="text-xl font-bold">Knowledge Graph Chat</h1>
            </div>
            <button
              onClick={() => setShowGraph(!showGraph)}
              className="flex items-center gap-2 bg-gray-700 px-4 py-2 rounded-lg hover:bg-gray-600"
            >
              <Network size={20} />
              {showGraph ? 'Hide' : 'Show'} Graph
            </button>
          </div>
          <div className="mt-2 text-sm text-gray-300">
            <div className="flex items-center gap-4 mb-1">
              <span>💡 <strong>Highlight</strong> + press <kbd className="bg-gray-700 px-2 py-0.5 rounded text-xs font-mono">⌘/⌥</kbd> for quick explanations</span>
              <span>🔗 <strong>Highlight</strong> + click button for deep-dive branches</span>
            </div>
            <div className="text-xs text-gray-400">
              Your questions flow horizontally (→) as main topics. Deep dives branch downward (↓) for exploration.
            </div>
          </div>
        </div>

        {showGraph && (
          <div className="border-b">
            <GraphVisualization />
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {activeNodeId && <ChatInterface nodeId={activeNodeId} isMain={true} />}
        </div>
      </div>

      {/* Side panel for branches */}
      {sidePanel && (
        <div className="w-96 border-l flex flex-col bg-gray-50">
          <div className="bg-gray-700 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChevronRight size={20} />
              <h2 className="font-semibold">Branch</h2>
            </div>
            <button
              onClick={() => setSidePanel(null)}
              className="hover:bg-gray-600 p-1 rounded"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatInterface nodeId={sidePanel.nodeId} />
          </div>
          <div className="p-3 bg-white border-t">
            <button
              onClick={() => {
                setActiveNodeId(sidePanel.nodeId);
                setSidePanel(null);
              }}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
            >
              Switch to This Branch
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeGraphChat;
