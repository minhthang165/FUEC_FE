import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  LayoutDashboard, Users, BookOpen, Database, Settings,
  ChevronDown, ChevronRight, User, LogOut, PanelLeftClose, Menu, Layers,
  Building2, GraduationCap, ClipboardList, Calendar, FileText, BookMarked, LayoutGrid, Flag
} from 'lucide-react';
import img_fpt from '../../../assets/img_fpt.svg';
import { useDispatch } from 'react-redux';
import { logout } from '../../../redux/authSlice';

interface MenuItem {
  id: string;
  label: string;
  icon: any;
  path?: string;
  subItems?: SubMenuItem[];
}

interface SubMenuItem {
  id: string;
  label: string;
  icon: any;
  path: string;
}

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  isMobile?: boolean;
}

function AdminSidebar({ isOpen, toggleSidebar, isMobile = false }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({});

  const toggleSubMenu = (menuId: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [menuId]: !prev[menuId]
    }));
  };

  const menuItems: MenuItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },

    {
      id: 'student_mgmt',
      label: 'Student Management',
      icon: Users,
      subItems: [
        { id: 'students', label: 'Students', icon: Users, path: '/admin/students' },
        { id: 'classes', label: 'Classes', icon: Layers, path: '/admin/classes' }
      ]
    },
    { id: 'teachers', label: 'Teacher Management', icon: Users, path: '/admin/teachers' },
    {
      id: 'question_banks',
      label: 'Question Banks',
      icon: Database,
      subItems: [
        { id: 'all-banks', label: 'All Banks', icon: Database, path: '/admin/question-banks' },
        { id: 'reported-questions', label: 'Reported Questions', icon: Flag, path: '/admin/question-banks/reported-questions' }
      ]
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      subItems: [
        { id: 'majors', label: 'Majors', icon: Building2, path: '/admin/settings/majors' },
        { id: 'subjects', label: 'Subjects', icon: GraduationCap, path: '/admin/settings/subjects' },
        { id: 'exam-types', label: 'Exam Types', icon: ClipboardList, path: '/admin/settings/exam-types' },
        { id: 'semesters', label: 'Semesters', icon: Calendar, path: '/admin/settings/semesters' },
        { id: 'curriculum', label: 'Curriculum', icon: BookMarked, path: '/admin/settings/curriculum' },
        { id: 'syllabus', label: 'Syllabus', icon: FileText, path: '/admin/settings/syllabus' }
      ]
    }
  ];

  const isActiveMenu = (item: MenuItem): boolean => {
    if (item.path) {
      return location.pathname === item.path;
    }
    if (item.subItems) {
      return item.subItems.some(sub => location.pathname === sub.path || location.pathname.startsWith(sub.path + '/'));
    }
    return false;
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.subItems) {
      toggleSubMenu(item.id);
    } else if (item.path) {
      navigate(item.path);
      if (isMobile) toggleSidebar();
    }
  };

  const handleSubMenuClick = (path: string) => {
    navigate(path);
    if (isMobile) toggleSidebar();
  };

  // Don't render on mobile when closed
  if (isMobile && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={toggleSidebar}
        />
      )}

      <div
        className={`fixed left-0 top-0 h-full bg-white/50 backdrop-blur-xl border-r border-white/40 shadow-[0_8px_32px_0_rgba(10,27,60,0.05)] transition-all duration-200 z-50 flex flex-col ${isMobile ? 'w-72' : isOpen ? 'w-64' : 'w-20'
          }`}
        style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        {/* Header - Logo */}
        <div className={`p-4 ${!isOpen && !isMobile ? 'flex justify-center' : ''}`}>
          <div className={`flex items-center ${isOpen || isMobile ? 'justify-between' : 'justify-center'}`}>
            <div className={`flex items-center ${isOpen || isMobile ? 'gap-3' : ''}`}>
              <div className="w-16 h-16 rounded-xl flex items-center justify-center p-2">
                <img src={img_fpt} alt="FPT Logo" className="w-full h-full object-contain" />
              </div>
              {(isOpen || isMobile) && (
                <div className="overflow-hidden">
                  <h3 className="font-semibold text-[#F37022] text-base">EduConnect</h3>
                  <p className="text-[11px] text-gray-500">www.fpt.edu.vn</p>
                </div>
              )}
            </div>
            {(isOpen || isMobile) && (
              <button
                onClick={toggleSidebar}
                className="w-8 h-8 flex items-center justify-center border border-white/40 bg-white/50 rounded-lg hover:bg-white/80 hover:border-white/60 transition-all flex-shrink-0"
              >
                <PanelLeftClose className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
        </div>

        {/* Toggle Button - Only when collapsed on desktop */}
        {!isMobile && !isOpen && (
          <div className="px-4 pb-3 flex justify-center">
            <button
              onClick={toggleSidebar}
              className="w-12 h-10 flex items-center justify-center border border-white/40 bg-white/50 rounded-lg hover:bg-white/80 hover:border-white/60 transition-all shadow-sm"
            >
              <Menu className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        )}

        {/* Menu Items */}
        <div className="flex-1 py-4 px-3 overflow-y-auto">
          {(isOpen || isMobile) && <div className="px-3 mb-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">MENU</div>}

          {menuItems.map(item => {
            const Icon = item.icon;
            const isExpanded = expandedMenus[item.id];
            const isActive = isActiveMenu(item);

            return (
              <div key={item.id}>
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all mb-1 ${isActive
                    ? 'bg-orange-50/80 text-orange-600 shadow-sm border border-orange-100/50'
                    : 'text-gray-700 hover:bg-white/60 hover:shadow-sm border border-transparent'
                    } ${!isOpen && !isMobile ? 'justify-center' : ''}`}
                  onClick={() => handleMenuClick(item)}
                  title={!isOpen && !isMobile ? item.label : ''}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {(isOpen || isMobile) && (
                    <>
                      <span className="flex-1 text-left text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>
                      {item.subItems && (
                        <span className="flex-shrink-0">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </span>
                      )}
                    </>
                  )}
                </button>

                {/* Sub-menu */}
                {(isOpen || isMobile) && item.subItems && isExpanded && (
                  <div className="ml-3 pl-3 border-l border-white/40 mt-1 mb-1 flex flex-col gap-1">
                    {item.subItems.map(sub => {
                      const SubIcon = sub.icon;
                      const isSubActive = location.pathname === sub.path;

                      return (
                        <button
                          key={sub.id}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-all border border-transparent ${isSubActive
                            ? 'bg-orange-50/80 text-orange-600 shadow-sm border-orange-100/50'
                            : 'text-gray-600 hover:bg-white/60 hover:shadow-sm'
                            }`}
                          onClick={() => handleSubMenuClick(sub.path)}
                        >
                          <SubIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="font-medium">{sub.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-white/40 p-3 bg-transparent">

          <button
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-gray-700 hover:bg-white/60 hover:shadow-sm rounded-lg transition-all ${!isOpen && !isMobile ? 'justify-center' : ''}`}
            title={!isOpen && !isMobile ? 'Logout' : ''}
            onClick={() => {
              dispatch(logout());
              navigate('/sign-in');
            }}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {(isOpen || isMobile) && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </div>
    </>
  );
}

export default AdminSidebar;
