import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';

export function CartButton() {
  const { cart } = useCart();
  const { profile } = useAuth();

  if (!profile) return null;

  // Only show for selected_content or pending users (matching UserProfileMenu logic)
  const showCart = (profile.role === 'selected_content' && profile.status !== 'expired') || profile.status === 'pending';
  
  if (!showCart) return null;

  return (
    <Link 
      to="/cart" 
      className="relative p-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
      title="Cart"
    >
      <ShoppingCart className="w-5 h-5" />
      {cart.length > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full border-2 border-white dark:border-zinc-950 px-1">
          {cart.length}
        </span>
      )}
    </Link>
  );
}
