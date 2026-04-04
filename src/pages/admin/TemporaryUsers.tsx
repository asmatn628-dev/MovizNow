import { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { UserProfile, Content } from '../../types';
import { Settings, X, Check, Search } from 'lucide-react';
import AlertModal from '../../components/AlertModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { smartSearch } from '../../utils/searchUtils';

export default function TemporaryUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [contentList, setContentList] = useState<Content[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [contentSearchTerm, setContentSearchTerm] = useState('');
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'temporary'));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({ ...doc.data() } as UserProfile));
        
        const now = new Date();
        const batch = writeBatch(db);
        let hasUpdates = false;

        data.forEach((user, index) => {
          if (user.status === 'active' && user.expiryDate) {
            const expiryDate = new Date(user.expiryDate);
            expiryDate.setDate(expiryDate.getDate() + 1);
            if (now > expiryDate) {
              batch.update(snapshot.docs[index].ref, { status: 'expired' });
              user.status = 'expired';
              hasUpdates = true;
            }
          }
        });

        if (hasUpdates) {
          await batch.commit();
        }

        setUsers(data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching temporary users:", error);
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'users');
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'content'));
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Content));
        setContentList(data.sort((a, b) => a.title.localeCompare(b.title)));
      } catch (error) {
        console.error("Content fetch error:", error);
        handleFirestoreError(error, OperationType.LIST, 'content');
      }
    };
    fetchContent();
  }, []);

  const handleManageAccess = (user: UserProfile) => {
    setSelectedUser(user);
    setAssignedIds(new Set(user.assignedContent || []));
  };

  const toggleContent = (contentId: string, seasons?: any[]) => {
    const newSet = new Set(assignedIds);
    if (newSet.has(contentId)) {
      newSet.delete(contentId);
      if (seasons) {
        seasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
      }
    } else {
      newSet.add(contentId);
      if (seasons) {
        seasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
      }
    }
    setAssignedIds(newSet);
  };

  const toggleSeason = (contentId: string, seasonId: string, allSeasons: any[]) => {
    const newSet = new Set(assignedIds);
    const seasonKey = `${contentId}:${seasonId}`;
    
    if (newSet.has(contentId)) {
      newSet.delete(contentId);
      allSeasons.forEach(s => {
        if (s.id !== seasonId) {
          newSet.add(`${contentId}:${s.id}`);
        }
      });
    } else if (newSet.has(seasonKey)) {
      newSet.delete(seasonKey);
    } else {
      newSet.add(seasonKey);
      let allSelected = true;
      for (const s of allSeasons) {
        if (s.id !== seasonId && !newSet.has(`${contentId}:${s.id}`)) {
          allSelected = false;
          break;
        }
      }
      if (allSelected) {
        allSeasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
        newSet.add(contentId);
      }
    }
    setAssignedIds(newSet);
  };

  const handleSaveAccess = async () => {
    if (!selectedUser) return;
    try {
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: Array.from(assignedIds),
      });
      setSelectedUser(null);
      setAssignedIds(new Set());
    } catch (error) {
      console.error('Error updating access:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update access' });
    }
  };

  const filteredUsers = useMemo(() => {
    if (!userSearchTerm) return users;
    return smartSearch(users, userSearchTerm, ['displayName', 'email', 'phone']);
  }, [users, userSearchTerm]);

  const filteredContent = useMemo(() => {
    if (!contentSearchTerm) return contentList;
    return smartSearch(contentList, contentSearchTerm);
  }, [contentList, contentSearchTerm]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white transition-colors duration-300">Temporary Users Access</h1>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search users..."
            value={userSearchTerm}
            onChange={(e) => setUserSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredUsers.map((user) => (
            <div key={user.uid} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm transition-colors duration-300">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg text-zinc-900 dark:text-white transition-colors duration-300">{user.displayName || 'No Name'}</h3>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm transition-colors duration-300">{user.email}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                {user.status}
              </span>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-1 transition-colors duration-300">Assigned Content</p>
              <p className="font-medium text-2xl text-emerald-500">
                {(user.assignedContent || []).length} items
              </p>
            </div>

            <button
              onClick={() => handleManageAccess(user)}
              className="w-full bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-4 py-2 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors duration-300"
            >
              <Settings className="w-4 h-4" />
              Manage Access
            </button>
          </div>
        ))}
        {filteredUsers.length === 0 && (
          <div className="col-span-full text-center py-12 text-zinc-500 dark:text-zinc-400 transition-colors duration-300">
            No temporary users found. Change a user's role to "Temporary" in the Membership tab.
          </div>
        )}
      </div>
      )}

      {/* Access Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl transition-colors duration-300">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white transition-colors duration-300">Manage Access</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm transition-colors duration-300">Select content for {selectedUser.displayName || selectedUser.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search content..."
                    value={contentSearchTerm}
                    onChange={(e) => setContentSearchTerm(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
                  />
                </div>
                <button onClick={() => setSelectedUser(null)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-2 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {filteredContent.map((content) => {
                  const isSeries = content.type === 'series';
                  const seasons = isSeries && content.seasons ? JSON.parse(content.seasons) : [];
                  const isFullyAssigned = assignedIds.has(content.id);
                  const isPartiallyAssigned = !isFullyAssigned && seasons.some((s: any) => assignedIds.has(`${content.id}:${s.id}`));

                  return (
                    <div key={content.id} className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden transition-colors duration-300">
                      <label
                        className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${
                          isFullyAssigned
                            ? 'bg-emerald-500/10'
                            : isPartiallyAssigned ? 'bg-emerald-500/5' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={isFullyAssigned}
                          onChange={() => toggleContent(content.id, seasons)}
                        />
                        <div className={`w-6 h-6 rounded flex items-center justify-center border transition-colors ${
                          isFullyAssigned ? 'bg-emerald-500 border-emerald-500' : isPartiallyAssigned ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-300 dark:border-zinc-600'
                        }`}>
                          {isFullyAssigned && <Check className="w-4 h-4 text-zinc-900 dark:text-white" />}
                          {!isFullyAssigned && isPartiallyAssigned && <div className="w-3 h-3 bg-emerald-500 rounded-sm" />}
                        </div>
                        <div className="flex-1 flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-zinc-900 dark:text-white transition-colors duration-300">{content.title}</h4>
                            <p className="text-xs text-zinc-500 dark:text-zinc-500 capitalize transition-colors duration-300">{content.type} • {content.year}</p>
                          </div>
                          {content.status === 'draft' && (
                            <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded font-medium">Draft</span>
                          )}
                        </div>
                      </label>
                      
                      {isSeries && seasons.length > 0 && (
                        <div className="border-t border-zinc-100 dark:border-zinc-800/50 bg-zinc-100/30 dark:bg-zinc-900/30 p-2 pl-14 space-y-1 transition-colors duration-300">
                          {seasons.map((season: any) => {
                            const isSeasonAssigned = isFullyAssigned || assignedIds.has(`${content.id}:${season.id}`);
                            return (
                              <label key={season.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors">
                                <input
                                  type="checkbox"
                                  className="hidden"
                                  checked={isSeasonAssigned}
                                  onChange={() => toggleSeason(content.id, season.id, seasons)}
                                />
                                <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                                  isSeasonAssigned ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 dark:border-zinc-600'
                                }`}>
                                  {isSeasonAssigned && <Check className="w-3 h-3 text-zinc-900 dark:text-white" />}
                                </div>
                                <span className="text-sm text-zinc-600 dark:text-zinc-300 transition-colors duration-300">Season {season.seasonNumber}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {filteredContent.length === 0 && (
                  <p className="text-center text-zinc-500 dark:text-zinc-500 py-8 transition-colors duration-300">No content available.</p>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-4">
              <button
                onClick={() => setSelectedUser(null)}
                className="px-6 py-2 rounded-xl font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors duration-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAccess}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl font-medium shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />
    </div>
  );
}
