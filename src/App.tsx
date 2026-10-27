/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Ticket as TicketIcon, 
  Package, 
  Plus,
  PlusCircle, 
  LogOut, 
  User as UserIcon, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Filter, 
  Search,
  ChevronRight,
  BarChart3,
  Settings,
  Menu,
  X,
  ShieldCheck,
  Wrench,
  FileText
} from 'lucide-react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  Timestamp,
  where,
  getDocs
} from 'firebase/firestore';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type UserRole = 'agent' | 'technicien' | 'responsable';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
}

type TicketStatus = 'Nouveau' | 'Assigné' | 'En cours' | 'En attente de pièces' | 'Résolu' | 'Clos';
type TicketPriority = 'Urgent' | 'Normal' | 'Bas';
type TicketCategory = 'Voirie' | 'Éclairage public' | 'Bâtiments communaux' | 'Espaces verts' | 'Informatique';

interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  assetId?: string;
  authorId: string;
  authorName?: string;
  technicianId?: string;
  createdAt: any;
  updatedAt?: any;
}

interface Asset {
  id: string;
  name: string;
  type: 'véhicule' | 'informatique' | 'bâtiment';
  description?: string;
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  size = 'md',
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg' }) => {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    secondary: 'bg-slate-800 text-white hover:bg-slate-900 shadow-sm',
    outline: 'border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-700',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };
  return (
    <button 
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className, ...props }: { children: React.ReactNode, className?: string } & React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden', className)} {...props}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }: { children: React.ReactNode, variant?: 'default' | 'success' | 'warning' | 'error' | 'info' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    warning: 'bg-amber-50 text-amber-700 border-amber-100',
    error: 'bg-rose-50 text-rose-700 border-rose-100',
    info: 'bg-blue-50 text-blue-700 border-blue-100',
  };
  return (
    <span className={cn('px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full border', variants[variant])}>
      {children}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tickets' | 'assets' | 'team' | 'settings'>('dashboard');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [showNewAssetModal, setShowNewAssetModal] = useState(false);
  const [showNewUserModal, setShowNewUserModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Auth & Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const docRef = doc(db, 'users', u.uid);
          const docSnap = await getDoc(docRef);
          const isAdminEmail = u.email?.toLowerCase() === 'noeballet.nb@gmail.com';
          
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            if (isAdminEmail && data.role !== 'responsable') {
              // Auto-upgrade admin if they were previously an agent
              data.role = 'responsable';
              setProfile(data); // Set immediately
              try {
                await updateDoc(docRef, { role: 'responsable' });
              } catch (e) {
                console.error("Failed to auto-update role", e);
              }
            } else {
              setProfile(data);
            }
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              name: u.displayName || 'Anonyme',
              role: isAdminEmail ? 'responsable' : 'agent'
            };
            setProfile(newProfile); // Set immediately
            try {
              await setDoc(docRef, newProfile);
            } catch (e) {
              console.error("Failed to create profile", e);
            }
          }
        } catch (err) {
          console.error("Erreur lors de l'initialisation du profil:", err);
          alert("Une erreur est survenue lors de la connexion à la base de données. Veuillez rafraîchir la page.");
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) return;

    try {
      const qTickets = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));
      const unsubTickets = onSnapshot(qTickets, (snapshot) => {
        setTickets(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ticket)));
      }, (error) => {
        console.error("Erreur de chargement des tickets:", error);
      });

      const qAssets = query(collection(db, 'assets'));
      const unsubAssets = onSnapshot(qAssets, (snapshot) => {
        setAssets(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Asset)));
      }, (error) => {
        console.error("Erreur de chargement des actifs:", error);
      });

      const qUsers = query(collection(db, 'users'));
      const unsubUsers = onSnapshot(qUsers, (snapshot) => {
        setUsers(snapshot.docs.map(d => d.data() as UserProfile));
      }, (error) => {
        console.error("Erreur de chargement des utilisateurs:", error);
      });

      return () => {
        unsubTickets();
        unsubAssets();
        unsubUsers();
      };
    } catch (err) {
      console.error("Erreur lors de la configuration des écouteurs:", err);
    }
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const handleLogout = () => signOut(auth);

  const stats = useMemo(() => {
    const total = tickets.length;
    const resolved = tickets.filter(t => t.status === 'Résolu' || t.status === 'Clos').length;
    const pending = tickets.filter(t => t.status === 'Nouveau' || t.status === 'Assigné' || t.status === 'En cours').length;
    const urgent = tickets.filter(t => t.priority === 'Urgent' && t.status !== 'Clos').length;

    const byCategory = tickets.reduce((acc: any, t) => {
      acc[t.category] = (acc[t.category] || 0) + 1;
      return acc;
    }, {});

    const chartData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

    return { total, resolved, pending, urgent, chartData };
  }, [tickets]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-center">
          <div className="bg-blue-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
            <ShieldCheck className="text-white w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">MuniTrack</h1>
          <p className="text-slate-500 mb-8">Gestion des incidents et traçabilité municipale</p>
          <Button onClick={handleLogin} className="w-full py-6 text-lg" variant="primary">
            Se connecter avec Google
          </Button>
          <p className="mt-6 text-xs text-slate-400">
            Accès réservé aux agents de la municipalité.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-slate-50 text-slate-900 overflow-hidden">
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: sidebarOpen ? 260 : 80 }}
        className="bg-slate-900 text-white flex flex-col z-30"
      >
        <div className="p-6 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shrink-0">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          {sidebarOpen && <span className="font-bold text-xl tracking-tight">MuniTrack</span>}
        </div>

        <nav className="flex-1 px-3 space-y-1 mt-4">
          <NavItem 
            icon={<LayoutDashboard size={20} />} 
            label="Tableau de bord" 
            active={activeTab === 'dashboard'} 
            collapsed={!sidebarOpen}
            onClick={() => setActiveTab('dashboard')} 
          />
          <NavItem 
            icon={<TicketIcon size={20} />} 
            label="Tickets" 
            active={activeTab === 'tickets'} 
            collapsed={!sidebarOpen}
            onClick={() => setActiveTab('tickets')} 
          />
          <NavItem 
            icon={<Package size={20} />} 
            label="Actifs" 
            active={activeTab === 'assets'} 
            collapsed={!sidebarOpen}
            onClick={() => setActiveTab('assets')} 
          />
          <NavItem 
            icon={<UserIcon size={20} />} 
            label="Équipe" 
            active={activeTab === 'team'} 
            collapsed={!sidebarOpen}
            onClick={() => setActiveTab('team')} 
          />
          <NavItem 
            icon={<Settings size={20} />} 
            label="Paramètres" 
            active={activeTab === 'settings'} 
            collapsed={!sidebarOpen}
            onClick={() => setActiveTab('settings')} 
          />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-3 rounded-lg bg-slate-800/50">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
              {profile?.name.charAt(0)}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.name}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{profile?.role}</p>
              </div>
            )}
            {sidebarOpen && (
              <button onClick={handleLogout} className="text-slate-400 hover:text-white transition-colors">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500 hover:text-slate-900 transition-colors">
              <Menu size={20} />
            </button>
            <h2 className="text-lg font-semibold capitalize">{activeTab}</h2>
          </div>
          <div className="flex items-center gap-4">
            <Button onClick={() => setShowNewTicketModal(true)} variant="primary" size="sm" className="gap-2">
              <PlusCircle size={16} />
              Nouveau Ticket
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <StatCard label="Total Tickets" value={stats.total} icon={<FileText className="text-blue-600" />} />
                  <StatCard label="En attente" value={stats.pending} icon={<Clock className="text-amber-600" />} />
                  <StatCard label="Urgents" value={stats.urgent} icon={<AlertCircle className="text-rose-600" />} />
                  <StatCard label="Résolus" value={stats.resolved} icon={<CheckCircle2 className="text-emerald-600" />} />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Répartition par Catégorie</h3>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="name" fontSize={12} axisLine={false} tickLine={false} />
                          <YAxis fontSize={12} axisLine={false} tickLine={false} />
                          <Tooltip 
                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          />
                          <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  <Card className="p-6">
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6">Activité Récente</h3>
                    <div className="space-y-4">
                      {tickets.slice(0, 5).map(ticket => (
                        <div key={ticket.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              ticket.priority === 'Urgent' ? "bg-rose-500" : ticket.priority === 'Normal' ? "bg-amber-500" : "bg-blue-500"
                            )} />
                            <div>
                              <p className="text-sm font-medium text-slate-900">{ticket.title}</p>
                              <p className="text-xs text-slate-500">{ticket.category} • {ticket.status}</p>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-slate-300" />
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </motion.div>
            )}

            {activeTab === 'tickets' && (
              <motion.div 
                key="tickets"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                  <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Rechercher un ticket..." 
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Filter size={16} />
                      Filtrer
                    </Button>
                  </div>
                </div>

                <Card>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Titre</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Statut</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priorité</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Catégorie</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigné à</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tickets.map(ticket => (
                        <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4 text-sm font-mono text-slate-400">#{ticket.id.slice(0, 5)}</td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-medium text-slate-900">{ticket.title}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[200px]">{ticket.description}</p>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={ticket.status} />
                          </td>
                          <td className="px-6 py-4">
                            <PriorityBadge priority={ticket.priority} />
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-600">{ticket.category}</span>
                          </td>
                          <td className="px-6 py-4">
                            {profile?.role === 'responsable' ? (
                              <select 
                                className="text-sm bg-transparent border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                                value={ticket.technicianId || ''}
                                onChange={async (e) => {
                                  const newTechId = e.target.value;
                                  try {
                                    await updateDoc(doc(db, 'tickets', ticket.id), { 
                                      technicianId: newTechId || null,
                                      status: newTechId ? 'Assigné' : 'Nouveau',
                                      updatedAt: serverTimestamp()
                                    });
                                  } catch (err) {
                                    console.error("Erreur d'assignation:", err);
                                    alert("Impossible d'assigner le ticket.");
                                  }
                                }}
                              >
                                <option value="">Non assigné</option>
                                {users.map(u => (
                                  <option key={u.uid} value={u.uid}>{u.name} ({u.role})</option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-sm text-slate-600">
                                {ticket.technicianId ? users.find(u => u.uid === ticket.technicianId)?.name || 'Agent inconnu' : 'Non assigné'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="sm" onClick={() => {}}>
                              Détails
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </motion.div>
            )}

            {activeTab === 'assets' && (
              <motion.div 
                key="assets"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-slate-900">Actifs & Équipements</h3>
                  {profile?.role === 'responsable' && (
                    <Button onClick={() => setShowNewAssetModal(true)} className="gap-2">
                      <Plus size={18} />
                      Créer un actif
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {assets.map(asset => (
                    <Card key={asset.id} className="p-6 hover:border-blue-200 transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="bg-slate-100 p-3 rounded-xl group-hover:bg-blue-50 transition-colors">
                          {asset.type === 'véhicule' && <Wrench className="text-slate-600 group-hover:text-blue-600" />}
                          {asset.type === 'informatique' && <BarChart3 className="text-slate-600 group-hover:text-blue-600" />}
                          {asset.type === 'bâtiment' && <Package className="text-slate-600 group-hover:text-blue-600" />}
                        </div>
                        <Badge variant="info">{asset.type}</Badge>
                      </div>
                      <h4 className="font-bold text-lg mb-1">{asset.name}</h4>
                      <p className="text-sm text-slate-500 mb-6">{asset.description || 'Aucune description'}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <span className="text-xs text-slate-400">ID: {asset.id}</span>
                        <Button variant="ghost" size="sm" className="text-blue-600">Voir tickets</Button>
                      </div>
                    </Card>
                  ))}
                  {profile?.role === 'responsable' && (
                    <button 
                      onClick={() => setShowNewAssetModal(true)}
                      className="border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50/30 transition-all gap-2"
                    >
                      <PlusCircle size={32} />
                      <span className="font-medium">Ajouter un actif</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'team' && (
              <motion.div 
                key="team"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-center">
                  <h3 className="text-xl font-bold text-slate-900">Membres de l'équipe</h3>
                  {profile?.role === 'responsable' && (
                    <Button onClick={() => setShowNewUserModal(true)} className="gap-2">
                      <Plus size={18} />
                      Ajouter un agent
                    </Button>
                  )}
                </div>
                <Card>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nom</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Rôle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {users.map(u => (
                        <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-medium text-slate-900">{u.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">{u.email}</td>
                          <td className="px-6 py-4">
                            {profile?.role === 'responsable' && u.email?.toLowerCase() !== 'noeballet.nb@gmail.com' ? (
                              <select 
                                className="text-sm bg-transparent border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                                value={u.role}
                                onChange={async (e) => {
                                  try {
                                    await updateDoc(doc(db, 'users', u.uid), { role: e.target.value });
                                  } catch (err) {
                                    console.error("Erreur mise à jour rôle:", err);
                                    alert("Impossible de modifier le rôle.");
                                  }
                                }}
                              >
                                <option value="agent">Agent</option>
                                <option value="technicien">Technicien</option>
                                <option value="responsable">Responsable</option>
                              </select>
                            ) : (
                              <Badge variant={u.role === 'responsable' ? 'error' : u.role === 'technicien' ? 'warning' : 'info'}>
                                {u.role}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-2xl"
              >
                <Card className="divide-y divide-slate-100">
                  <div className="p-6">
                    <h3 className="font-bold text-lg mb-1">Profil Utilisateur</h3>
                    <p className="text-sm text-slate-500">Gérez vos informations personnelles et vos préférences.</p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <label className="text-sm font-medium text-slate-500">Nom complet</label>
                      <div className="col-span-2 text-sm font-semibold">{profile?.name}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <label className="text-sm font-medium text-slate-500">Email</label>
                      <div className="col-span-2 text-sm font-semibold">{profile?.email}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <label className="text-sm font-medium text-slate-500">Rôle</label>
                      <div className="col-span-2">
                        <Badge variant="info">{profile?.role}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 flex justify-end gap-3">
                    {(profile?.role === 'responsable' || user?.email?.toLowerCase() === 'noeballet.nb@gmail.com') && (
                      <Button 
                        variant="ghost" 
                        onClick={async () => {
                          try {
                            // Also upgrade the user's role if they are the admin
                            if (user?.email?.toLowerCase() === 'noeballet.nb@gmail.com' && profile?.role !== 'responsable') {
                              await updateDoc(doc(db, 'users', user.uid), { role: 'responsable' });
                              setProfile(prev => prev ? { ...prev, role: 'responsable' } : null);
                            }
                            
                            const initialAssets: Asset[] = [
                              { id: 'V-001', name: 'Camion Benne #1', type: 'véhicule', description: 'Utilisé pour les espaces verts' },
                              { id: 'I-001', name: 'Serveur Mairie', type: 'informatique', description: 'Serveur principal de données' },
                              { id: 'B-001', name: 'Hôtel de Ville', type: 'bâtiment', description: 'Bâtiment administratif principal' },
                              { id: 'V-002', name: 'Véhicule de patrouille', type: 'véhicule', description: 'Police municipale' },
                            ];
                            for (const asset of initialAssets) {
                              await setDoc(doc(db, 'assets', asset.id), asset);
                            }
                            alert('Données initiales ajoutées !');
                          } catch (err) {
                            console.error("Erreur lors de la génération des données:", err);
                            alert("Erreur lors de la génération des données. Consultez la console.");
                          }
                        }}
                      >
                        Générer données de test
                      </Button>
                    )}
                    <Button variant="outline">Modifier le profil</Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* New Ticket Modal */}
      <AnimatePresence>
        {showNewTicketModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewTicketModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">Nouveau Ticket d'Incident</h3>
                <button onClick={() => setShowNewTicketModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form 
                className="p-8 space-y-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const newTicketRef = doc(collection(db, 'tickets'));
                  const techId = formData.get('technicianId') as string;
                  const assetId = formData.get('assetId') as string;
                  
                  const newTicket: any = {
                    id: newTicketRef.id,
                    title: formData.get('title') as string,
                    description: formData.get('description') as string,
                    category: formData.get('category') as TicketCategory,
                    priority: formData.get('priority') as TicketPriority,
                    status: techId ? 'Assigné' : 'Nouveau',
                    authorId: user.uid,
                    authorName: profile?.name,
                    createdAt: serverTimestamp(),
                  };
                  
                  if (techId) newTicket.technicianId = techId;
                  if (assetId) newTicket.assetId = assetId;

                  try {
                    await setDoc(newTicketRef, newTicket);
                    setShowNewTicketModal(false);
                  } catch (err) {
                    console.error('Error adding ticket:', err);
                    alert("Erreur lors de la création du ticket.");
                  }
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Titre de l'incident</label>
                  <input 
                    name="title"
                    required
                    placeholder="Ex: Éclairage public défectueux rue de la Paix" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Catégorie</label>
                    <select name="category" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                      <option>Voirie</option>
                      <option>Éclairage public</option>
                      <option>Bâtiments communaux</option>
                      <option>Espaces verts</option>
                      <option>Informatique</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Priorité</label>
                    <select name="priority" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                      <option>Bas</option>
                      <option>Normal</option>
                      <option>Urgent</option>
                    </select>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Assigner à (Optionnel)</label>
                    <select name="technicianId" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                      <option value="">Non assigné</option>
                      {users.map(u => (
                        <option key={u.uid} value={u.uid}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Actif concerné (Optionnel)</label>
                    <select name="assetId" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                      <option value="">Aucun actif</option>
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Description détaillée</label>
                  <textarea 
                    name="description"
                    rows={4}
                    placeholder="Décrivez précisément le problème..." 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 py-3" onClick={() => setShowNewTicketModal(false)}>Annuler</Button>
                  <Button type="submit" variant="primary" className="flex-1 py-3">Créer le ticket</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Asset Modal */}
      <AnimatePresence>
        {showNewAssetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewAssetModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">Nouvel Actif</h3>
                <button onClick={() => setShowNewAssetModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form 
                className="p-8 space-y-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const newAssetRef = doc(collection(db, 'assets'));
                  const newAsset = {
                    id: newAssetRef.id,
                    name: formData.get('name') as string,
                    type: formData.get('type') as 'véhicule' | 'informatique' | 'bâtiment',
                    description: formData.get('description') as string,
                  };
                  try {
                    await setDoc(newAssetRef, newAsset);
                    setShowNewAssetModal(false);
                  } catch (err) {
                    console.error('Error adding asset:', err);
                    alert("Erreur lors de la création de l'actif.");
                  }
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Nom de l'actif</label>
                  <input 
                    name="name"
                    required
                    placeholder="Ex: Camion Benne #2" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Type</label>
                  <select name="type" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                    <option value="véhicule">Véhicule</option>
                    <option value="informatique">Informatique</option>
                    <option value="bâtiment">Bâtiment</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Description</label>
                  <textarea 
                    name="description"
                    rows={3}
                    placeholder="Détails supplémentaires..." 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                  />
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 py-3" onClick={() => setShowNewAssetModal(false)}>Annuler</Button>
                  <Button type="submit" variant="primary" className="flex-1 py-3">Créer l'actif</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New User Modal */}
      <AnimatePresence>
        {showNewUserModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNewUserModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h3 className="text-xl font-bold text-slate-900">Ajouter un membre</h3>
                <button onClick={() => setShowNewUserModal(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form 
                className="p-8 space-y-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const newUserRef = doc(collection(db, 'users'));
                  const newUser = {
                    uid: newUserRef.id,
                    name: formData.get('name') as string,
                    email: formData.get('email') as string,
                    role: formData.get('role') as string,
                  };
                  try {
                    await setDoc(newUserRef, newUser);
                    setShowNewUserModal(false);
                  } catch (err) {
                    console.error('Error adding user:', err);
                    alert("Erreur lors de l'ajout de l'utilisateur.");
                  }
                }}
              >
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Nom complet</label>
                  <input 
                    name="name"
                    required
                    placeholder="Ex: Jean Dupont" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Adresse Email</label>
                  <input 
                    name="email"
                    type="email"
                    required
                    placeholder="Ex: jean.dupont@mairie.fr" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Rôle</label>
                  <select name="role" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all">
                    <option value="agent">Agent</option>
                    <option value="technicien">Technicien</option>
                    <option value="responsable">Responsable</option>
                  </select>
                </div>
                <div className="pt-4 flex gap-3">
                  <Button type="button" variant="outline" className="flex-1 py-3" onClick={() => setShowNewUserModal(false)}>Annuler</Button>
                  <Button type="submit" variant="primary" className="flex-1 py-3">Ajouter</Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function NavItem({ icon, label, active, onClick, collapsed }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void, collapsed: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
        active 
          ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" 
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      )}
    >
      <span className={cn("shrink-0 transition-transform group-hover:scale-110", active ? "text-white" : "text-slate-400")}>
        {icon}
      </span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </button>
  );
}

function StatCard({ label, value, icon }: { label: string, value: number | string, icon: React.ReactNode }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-slate-50 rounded-lg">
          {icon}
        </div>
        <Badge variant="default">+12%</Badge>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">{label}</p>
    </Card>
  );
}

function StatusBadge({ status }: { status: TicketStatus }) {
  const variants: Record<TicketStatus, any> = {
    'Nouveau': 'info',
    'Assigné': 'warning',
    'En cours': 'warning',
    'En attente de pièces': 'error',
    'Résolu': 'success',
    'Clos': 'default',
  };
  return <Badge variant={variants[status]}>{status}</Badge>;
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const variants: Record<TicketPriority, any> = {
    'Bas': 'default',
    'Normal': 'info',
    'Urgent': 'error',
  };
  return <Badge variant={variants[priority]}>{priority}</Badge>;
}
