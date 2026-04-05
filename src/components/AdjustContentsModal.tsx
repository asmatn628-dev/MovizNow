import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GripVertical, Save, Loader2, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Content } from '../types';
import { db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contentList: Content[];
}

export const AdjustContentsModal: React.FC<Props> = ({ isOpen, onClose, contentList }) => {
  const [items, setItems] = useState<Content[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useModalBehavior(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      // Sort by order first, then by createdAt descending
      const sorted = [...contentList].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order === undefined && b.order !== undefined) return -1;
        if (a.order !== undefined && b.order === undefined) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setItems(sorted);
      setSearchTerm('');
    }
  }, [isOpen, contentList]);

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.year.toString().includes(searchTerm)
  );

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    
    // If there is a search term, we shouldn't allow drag and drop because it messes up the absolute ordering
    if (searchTerm) return;

    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);
    
    setItems(newItems);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const chunkSize = 500;
      for (let i = 0; i < items.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + chunkSize);
        
        chunk.forEach((item, index) => {
          const contentRef = doc(db, 'content', item.id);
          batch.update(contentRef, { order: i + index });
        });
        
        await batch.commit();
      }
      onClose();
    } catch (error) {
      console.error("Error saving content order:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 md:p-5 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 transition-colors duration-300">
              <div className="flex items-center gap-4">
                <h2 className="text-lg md:text-xl font-bold">Adjust Contents Order</h2>
                <div className="relative w-64 hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 dark:text-zinc-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search to find (disables drag)..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 focus:outline-none focus:border-emerald-500 transition-colors duration-300"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-500 dark:text-zinc-400 transition-all active:scale-95"
                  disabled={saving}
                >
                  <X className="w-6 h-6" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !!searchTerm}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  Save Order
                </button>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
              {searchTerm && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-600 dark:text-yellow-400 text-sm transition-colors duration-300">
                  Drag and drop is disabled while searching. Clear the search to reorder items.
                </div>
              )}
              
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="content-list" isDropDisabled={!!searchTerm}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2 max-w-5xl mx-auto"
                    >
                      {filteredItems.map((item, index) => (
                        <Draggable 
                          key={item.id} 
                          draggableId={item.id} 
                          index={index}
                          isDragDisabled={!!searchTerm}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-4 p-3 rounded-xl border transition-colors duration-300 ${
                                snapshot.isDragging 
                                  ? 'bg-zinc-100 dark:bg-zinc-800 border-emerald-500 shadow-xl shadow-emerald-500/10 z-50' 
                                  : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80'
                              }`}
                            >
                              <div
                                {...provided.dragHandleProps}
                                className={`p-2 rounded-lg transition-colors ${searchTerm ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white cursor-grab active:cursor-grabbing'}`}
                              >
                                <GripVertical className="w-5 h-5" />
                              </div>
                              
                              <div className="w-12 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800 transition-colors duration-300">
                                {item.posterUrl ? (
                                  <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 dark:text-zinc-600">
                                    No Img
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-medium text-zinc-900 dark:text-white line-clamp-2 leading-tight transition-colors duration-300">{item.title}</h3>
                              </div>
                              
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                <span className={clsx(
                                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white",
                                  item.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
                                )}>
                                  {item.type}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-bold transition-colors duration-300">
                                  {item.year}
                                </span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
