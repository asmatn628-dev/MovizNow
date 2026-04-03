import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, getDocs } from 'firebase/firestore';
import { UserProfile, Role } from '../../types';
import { Users, ChevronRight, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { smartSearch } from '../../utils/searchUtils';
import ConfirmModal from '../../components/ConfirmModal';

export default function UserManagers() {
  const [managers, setManagers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [managerToRemove, setManagerToRemove] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const q = query(collection(db, 'users'), where('isUserManager', '==', true));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
        setManagers(data);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching managers:", error);
        setLoading(false);
      }
    };
    fetchManagers();
  }, []);

  const handleRemoveManager = async () => {
    if (!managerToRemove) return;
    try {
      await updateDoc(doc(db, 'users', managerToRemove), { isUserManager: false });
      setManagers(prev => prev.filter(m => m.uid !== managerToRemove));
      setManagerToRemove(null);
    } catch (error) {
      console.error('Error removing manager:', error);
      setManagerToRemove(null);
    }
  };

  const filteredManagers = smartSearch(managers, searchTerm, ['displayName', 'email']);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3 text-zinc-900 dark:text-white transition-colors duration-300">
          <Users className="w-8 h-8 text-emerald-500" />
          User Managers
        </h1>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          type="text"
          placeholder="Search managers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredManagers.map(manager => (
            <div 
              key={manager.uid}
              onClick={() => navigate(`/admin/users?managedBy=${manager.uid}`)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 cursor-pointer hover:border-emerald-500/50 transition-colors group shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  {manager.photoURL ? (
                    <img src={manager.photoURL} alt={manager.displayName} className="w-12 h-12 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-xl font-bold text-emerald-500 transition-colors duration-300">
                      {(manager.displayName || manager.email || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-lg text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                      {manager.displayName || 'No Name'}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 transition-colors duration-300">{manager.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      setManagerToRemove(manager.uid);
                    }}
                    className="p-2 text-zinc-400 dark:text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Remove from User Managers"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-zinc-400 dark:text-zinc-600 group-hover:text-emerald-500 transition-colors" />
                </div>
              </div>
              
              <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400 pt-4 border-t border-zinc-100 dark:border-zinc-800 transition-colors duration-300">
                <div className="flex flex-col">
                  <span>Joined {format(new Date(manager.createdAt), 'MMM yyyy')}</span>
                  <span className={`text-[10px] font-bold uppercase mt-1 ${manager.role === 'user_manager' || manager.role === 'manager' ? 'text-emerald-500' : 'text-zinc-500 dark:text-zinc-500'}`}>
                    Current Role: {manager.role === 'selected_content' ? 'Selected Content' : 
                                   manager.role === 'content_manager' ? 'Content Manager' :
                                   manager.role === 'user_manager' ? 'User Manager' :
                                   manager.role === 'manager' ? 'Manager' :
                                   manager.role.charAt(0).toUpperCase() + manager.role.slice(1).replace('_', ' ')}
                  </span>
                </div>
                <span className="bg-emerald-500/10 text-emerald-500 px-2 py-1 rounded-md font-medium text-xs">
                  View Users
                </span>
              </div>
            </div>
          ))}
          
          {filteredManagers.length === 0 && (
            <div className="col-span-full p-8 text-center text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl transition-colors duration-300">
              No User Managers found.
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={!!managerToRemove}
        title="Remove User Manager"
        message="Are you sure you want to remove this user from the User Managers list? They will no longer be able to manage other users."
        confirmText="Remove"
        onConfirm={handleRemoveManager}
        onCancel={() => setManagerToRemove(null)}
      />
    </div>
  );
}
