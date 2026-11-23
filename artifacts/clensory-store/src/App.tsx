import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CreditCard, Leaf, LogIn, LogOut, Menu, Minus, Plus, Receipt, ShieldCheck, ShoppingBag, Star, Truck, X } from 'lucide-react';
import { getPaymentStatus, useCancelCardOrder, useCreateCardCheckout, useCreateOrder, useGetAdminOrders, useGetBillingHistory, useHealthCheck, type AdminOrderRecord, type BillingHistoryRecord } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import logo from '@assets/Clensory_(1)_1786865672056.png';
import laundroPhoto from '@assets/0_Clenso_(12)_1786866511997.png';
import clensoPhoto from '@assets/1_Clenso_(11)_1786866511998.png';

const queryClient = new QueryClient();

type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  isAdmin: boolean;
};

function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (!res.ok) {
        setUser(null);
      } else {
        const data = (await res.json()) as { user: AuthUser | null };
        setUser(data.user ?? null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  return {
    user,
    isAuthenticated: Boolean(user),
    isLoading,
    authModalOpen,
    setAuthModalOpen,
    login: () => setAuthModalOpen(true),
    logout,
    refreshUser,
  };
}


function AuthModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="billing-modal-wrap" role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="billing-modal" style={{ maxWidth: 420 }}>
        <div className="billing-head">
          <div>
            <div className="eyebrow">Clensory account</div>
            <h2>{mode === 'login' ? 'Welcome back' : 'Create an account'}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={21} /></button>
        </div>
        <form className="checkout-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-row">
              <div className="field"><label htmlFor="authFirst">First name</label><input id="authFirst" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Areeba" /></div>
              <div className="field"><label htmlFor="authLast">Last name</label><input id="authLast" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Nadeem" /></div>
            </div>
          )}
          <div className="field"><label htmlFor="authEmail">Email address</label><input id="authEmail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
          <div className="field"><label htmlFor="authPass">Password</label><input id="authPass" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></div>
          {error && <div className="field-error">{error}</div>}
          <button type="submit" className="primary-button" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'} <ArrowRight size={15} />
          </button>
          <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13 }}>
            {mode === 'login' ? 'New to Clensory? ' : 'Already have an account? '}
            <button type="button" className="back-link" style={{ display: 'inline' }} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Create an account' : 'Log in instead'}
            </button>
          </p>
        </form>
      </section>
    </div>
  );
}

type Review = { author: string; text: string };
type ProductVariant = { productId: string; label: string; size: string; price: number; bottleCount: number };
type Product = {
  id: string; name: string; eyebrow: string; description: string; variants: ProductVariant[]; image: string;
  color: string; category: string; rating: number; reviewCount: number; reviews: Review[]; featured: boolean;
};
type CartItem = { product: Product; variant: ProductVariant; quantity: number };
type Shipping = { fullName: string; email: string; phone: string; address: string; city: string; province: string; postalCode: string; notes: string; paymentMethod: 'cod' | 'card' };

const products: Product[] = [
  { id: 'clenso', name: 'Clenso', eyebrow: 'Dishwash cleaner', description: 'A bright, hardworking dishwash cleaner for the daily pile, made to leave plates fresh and hands comfortable.', variants: [{ productId: 'clenso-1l', label: '1L bottle', size: '1L bottle', price: 550, bottleCount: 1 }, { productId: 'clenso-3l', label: '3L bundle', size: '3L total · 3 × 1L bottles', price: 1500, bottleCount: 3 }], image: clensoPhoto, color: '#e8c947', category: 'clenso', rating: 4.9, reviewCount: 38, featured: true, reviews: [{ author: 'Ayesha, Lahore', text: 'A little goes a long way, and it cuts through the after-dinner pile.' }, { author: 'Mariam, Karachi', text: 'Fresh dishes without that sharp chemical smell.' }] },
  { id: 'laundro', name: 'Laundro', eyebrow: 'Laundry detergent', description: 'A gentle everyday laundry detergent that lifts the day away and leaves clothes feeling clean, soft and ready to wear.', variants: [{ productId: 'laundro-1l', label: '1L bottle', size: '1L bottle', price: 550, bottleCount: 1 }, { productId: 'laundro-3l', label: '3L bundle', size: '3L total · 3 × 1L bottles', price: 1500, bottleCount: 3 }], image: laundroPhoto, color: '#76a9d4', category: 'laundro', rating: 4.8, reviewCount: 24, featured: true, reviews: [{ author: 'Sana, Islamabad', text: 'Our clothes come out fresh without an overpowering scent.' }, { author: 'Hiba, Rawalpindi', text: 'It feels gentle on everyday fabrics and lasts ages.' }] },
];

const adminEmails = new Set(['clensory.pk@gmail.com', 'reebo.nadeem@gmail.com']);
const emptyShipping: Shipping = { fullName: '', email: '', phone: '', address: '', city: '', province: '', postalCode: '', notes: '', paymentMethod: 'cod' };
const checkoutDraftStorageKey = 'clensory-checkout-draft';

function readCheckoutDraft(): { cart: CartItem[]; shipping: Shipping; retryBlocked: boolean; recoveryOrderNumber: string | null } {
  const emptyDraft = { cart: [], shipping: emptyShipping, retryBlocked: false, recoveryOrderNumber: null };
  try {
    const stored = sessionStorage.getItem(checkoutDraftStorageKey);
    if (!stored) return emptyDraft;
    const parsed = JSON.parse(stored) as { cart?: unknown; shipping?: unknown; retryBlocked?: unknown; recoveryOrderNumber?: unknown };
    const cart = Array.isArray(parsed.cart)
      ? parsed.cart.flatMap((entry): CartItem[] => {
          if (!entry || typeof entry !== 'object') return [];
          const savedItem = entry as { productId?: unknown; variantId?: unknown; quantity?: unknown };
          const product = products.find((candidate) => candidate.id === savedItem.productId);
          const variant = product?.variants.find((candidate) => candidate.productId === savedItem.variantId) ?? product?.variants[0];
          const quantity = Number(savedItem.quantity);
          return product && variant && Number.isFinite(quantity) && quantity > 0
            ? [{ product, variant, quantity: Math.floor(quantity) }]
            : [];
        })
      : [];
    const savedShipping = parsed.shipping && typeof parsed.shipping === 'object'
      ? parsed.shipping as Partial<Shipping>
      : {};
    const text = (value: unknown) => typeof value === 'string' ? value : '';
    return {
      cart,
      retryBlocked: parsed.retryBlocked === true,
      recoveryOrderNumber: typeof parsed.recoveryOrderNumber === 'string' ? parsed.recoveryOrderNumber : null,
      shipping: {
        fullName: text(savedShipping.fullName),
        email: text(savedShipping.email),
        phone: text(savedShipping.phone),
        address: text(savedShipping.address),
        city: text(savedShipping.city),
        province: text(savedShipping.province),
        postalCode: text(savedShipping.postalCode),
        notes: text(savedShipping.notes),
        paymentMethod: savedShipping.paymentMethod === 'card' ? 'card' : 'cod',
      },
    };
  } catch {
    return emptyDraft;
  }
}

function persistCheckoutDraft(cart: CartItem[], shipping: Shipping, retryBlocked = false, recoveryOrderNumber: string | null = null) {
  try {
    if (cart.length === 0) {
      sessionStorage.removeItem(checkoutDraftStorageKey);
      return;
    }
    sessionStorage.setItem(checkoutDraftStorageKey, JSON.stringify({
      cart: cart.map(({ product, variant, quantity }) => ({ productId: product.id, variantId: variant.productId, quantity })),
      shipping,
      retryBlocked,
      recoveryOrderNumber,
    }));
  } catch {
    // Checkout remains available if the browser blocks session storage.
  }
}

const formatPrice = (price: number) => `Rs. ${price.toLocaleString('en-PK')}`;

function ProductArt({ product, large = false }: { product: Product; large?: boolean }) {
  return (
    <div className={`product-image ${product.category} ${large ? 'detail-visual' : ''}`} data-testid={`img-product-${product.id}`}>
      <img className="product-photo" src={product.image} alt={`${product.name} by Clensory`} />
      {large && <div className="hero-stamp">made for<br />daily living</div>}
    </div>
  );
}

function Rating({ product }: { product: Product }) {
  return <div className="rating" data-testid={`text-rating-${product.id}`} aria-label={`${product.rating} out of 5 stars`}><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><span>{product.rating} · {product.reviewCount} reviews</span></div>;
}

function ProductCard({ product, onDetail, onAdd }: { product: Product; onDetail: (p: Product) => void; onAdd: (p: Product, variant: ProductVariant) => void }) {
  const singleBottle = product.variants[0];
  return (
    <article className="product-card" data-testid={`card-product-${product.id}`}>
      <button type="button" className="unstyled-product" onClick={() => onDetail(product)} data-testid={`button-details-${product.id}`} aria-label={`View details for ${product.name}`} style={{ display: 'block', width: '100%', border: 0, padding: 0, background: 'transparent', textAlign: 'left' }}>
        <ProductArt product={product} />
      </button>
      <div className="card-body">
        <div className="card-top"><div className="eyebrow">{product.eyebrow}</div><div className="card-price">From {formatPrice(singleBottle.price)}</div></div>
        <h3>{product.name}</h3>
        <p>1L bottle · 3L bundle available</p>
        <Rating product={product} />
        <div className="card-actions">
          <button type="button" className="add-button" onClick={() => onAdd(product, singleBottle)} data-testid={`button-add-${product.id}`}>Add 1L to bag</button>
          <button type="button" className="round-action" onClick={() => onDetail(product)} data-testid={`button-review-${product.id}`} aria-label={`Read reviews for ${product.name}`}><Star size={15} /></button>
        </div>
      </div>
    </article>
  );
}

function ProductDetail({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (p: Product, variant: ProductVariant) => void }) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0].productId);
  const selectedVariant = product.variants.find((variant) => variant.productId === selectedVariantId) ?? product.variants[0];
  return (
    <div className="detail-modal-wrap" role="dialog" aria-modal="true" data-testid="dialog-product-detail" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="detail-modal">
        <button type="button" className="icon-button detail-close" onClick={onClose} data-testid="button-close-details" aria-label="Close product details"><X size={20} /></button>
        <div className="detail-content">
          <ProductArt product={product} large />
          <div className="detail-info">
            <div className="eyebrow">{product.eyebrow}</div>
            <h2>{product.name}</h2>
            <Rating product={product} />
            <div className="variant-options" role="group" aria-label={`${product.name} size and price`}>
              {product.variants.map((variant) => <button key={variant.productId} type="button" className={`variant-option${selectedVariant.productId === variant.productId ? ' selected' : ''}`} aria-pressed={selectedVariant.productId === variant.productId} onClick={() => setSelectedVariantId(variant.productId)} data-testid={`button-variant-${variant.productId}`}>
                <span className="variant-option-heading"><strong>{variant.label}</strong><strong>{formatPrice(variant.price)}</strong></span>
                <small>{variant.bottleCount === 1 ? 'One 1L bottle' : 'Three 1L bottles · 3L total'}</small>
              </button>)}
            </div>
            <div className="detail-meta" aria-live="polite"><span>{selectedVariant.size}</span><strong>{formatPrice(selectedVariant.price)}</strong></div>
            <p className="variant-volume-note">Each bottle contains 1L. The 3L bundle includes three 1L bottles.</p>
            <p>{product.description}</p>
            <button type="button" className="primary-button" onClick={() => { onAdd(product, selectedVariant); onClose(); }} data-testid={`button-detail-add-${product.id}`}>Add {selectedVariant.label} to bag <ArrowRight size={15} /></button>
            <div className="review-section"><h3>What homes are saying</h3>{product.reviews.map((review) => <div className="review" key={review.author}><div className="rating"><Star size={11} fill="currentColor" /><Star size={11} fill="currentColor" /><Star size={11} fill="currentColor" /><Star size={11} fill="currentColor" /><Star size={11} fill="currentColor" /></div><p>“{review.text}”</p><small>{review.author}</small></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingHistoryWindow({ records, isLoading, isError, user, onClose }: {
  records: BillingHistoryRecord[]; isLoading: boolean; isError: boolean; user: NonNullable<ReturnType<typeof useAuth>['user']>; onClose: () => void;
}) {
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Your account';
  return <div className="billing-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="billing-history-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="billing-modal">
      <div className="billing-head"><div><div className="eyebrow">Your account</div><h2 id="billing-history-title">Billing history</h2></div><button type="button" className="icon-button" onClick={onClose} data-testid="button-close-billing" aria-label="Close billing history"><X size={21} /></button></div>
      <div className="billing-account"><div className="billing-account-icon"><Receipt size={17} /></div><div><strong>{displayName}</strong><span>{user.email || 'Signed-in Clensory customer'}</span></div></div>
      {isLoading ? <div className="billing-state"><div className="billing-loader" /><p>Loading your billing history...</p></div> : isError ? <div className="billing-state"><Receipt size={28} /><h3>Billing history unavailable</h3><p>We couldn’t load your orders right now. Please try again shortly.</p></div> : records.length === 0 ? <div className="billing-state"><Receipt size={28} /><h3>No billing history yet</h3><p>Your completed Clensory orders will appear here after checkout.</p></div> : <div className="billing-records">{records.map((record) => <article className="billing-record" key={record.orderNumber}><div className="billing-record-head"><div><span className="billing-order-number">{record.orderNumber}</span><span className="billing-date"><CalendarDays size={12} />{new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(new Date(record.createdAt))}</span></div><strong>{formatPrice(record.total)}</strong></div><div className="billing-items">{record.items.map((item) => <div className="billing-item" key={`${record.orderNumber}-${item.productId}`}><span>{item.productName} × {item.quantity}</span><span>{formatPrice(item.unitPrice * item.quantity)}</span></div>)}</div><div className="billing-breakdown"><span>Subtotal <strong>{formatPrice(record.subtotal)}</strong></span><span>Delivery <strong>{record.deliveryFee === 0 ? 'Complimentary' : formatPrice(record.deliveryFee)}</strong></span></div><div className="billing-delivery">{record.city} · {record.address}</div></article>)}</div>}
    </section>
  </div>;
}

function AdminOrderTrackingWindow({ records, isLoading, isError, onClose }: {
  records: AdminOrderRecord[]; isLoading: boolean; isError: boolean; onClose: () => void;
}) {
  return <div className="billing-modal-wrap" role="dialog" aria-modal="true" aria-labelledby="track-orders-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="billing-modal admin-orders-modal">
      <div className="billing-head"><div><div className="eyebrow">Admin workspace</div><h2 id="track-orders-title">Track orders</h2></div><button type="button" className="icon-button" onClick={onClose} data-testid="button-close-track-orders" aria-label="Close tracked orders"><X size={21} /></button></div>
      {isLoading ? <div className="billing-state"><div className="billing-loader" /><p>Loading every order receipt...</p></div> : isError ? <div className="billing-state"><Receipt size={28} /><h3>Order tracking unavailable</h3><p>We couldn’t load the admin order ledger right now.</p></div> : records.length === 0 ? <div className="billing-state"><Receipt size={28} /><h3>No orders yet</h3><p>New customer receipts will be stored here after checkout.</p></div> : <div className="billing-records">{records.map((record) => <article className="billing-record admin-order-record" key={record.orderNumber}><div className="billing-record-head"><div><span className="billing-order-number">{record.orderNumber}</span><span className="billing-date"><CalendarDays size={12} />{new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(new Date(record.createdAt))}</span></div><strong>{formatPrice(record.total)}</strong></div><div className="admin-order-badges"><span>{record.orderStatus.replaceAll('_', ' ')}</span><span>{record.paymentMethod === 'card' ? 'Card' : 'Cash on delivery'} · {record.paymentStatus.replaceAll('_', ' ')}</span></div><div className="admin-customer"><strong>{record.fullName}</strong><span>{record.customerEmail} · {record.phone}</span></div><div className="billing-items">{record.items.map((item) => <div className="billing-item" key={`${record.orderNumber}-${item.productId}`}><span>{item.productName} × {item.quantity}</span><span>{formatPrice(item.unitPrice * item.quantity)}</span></div>)}</div><div className="billing-delivery">{record.address}, {record.city}, {record.province} {record.postalCode}</div></article>)}</div>}
    </section>
  </div>;
}

function CartDrawer({ items, onClose, onChangeQty, onCheckout, checkout, onBack, shipping, setShipping, onSubmit, isPending, retryBlocked, onViewBilling, onCheckPrevious, canCheckPrevious, error, confirmation, onContinue, isAuthenticated }: {
  items: CartItem[]; onClose: () => void; onChangeQty: (variantId: string, delta: number) => void; onCheckout: () => void; checkout: boolean; onBack: () => void; shipping: Shipping; setShipping: (shipping: Shipping) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; isPending: boolean; retryBlocked: boolean; onViewBilling: () => void; onCheckPrevious: () => void; canCheckPrevious: boolean; error: string; confirmation: string; onContinue: () => void; isAuthenticated: boolean;
}) {
  const subtotal = items.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);
  const delivery = subtotal > 3000 || subtotal === 0 ? 0 : 250;
  const total = subtotal + delivery;
  const update = (key: keyof Shipping, value: string) => setShipping({ ...shipping, [key]: value });
  return <><div className="drawer-overlay" onClick={onClose} data-testid="drawer-overlay" /><aside className="drawer" aria-label={checkout ? 'Checkout' : 'Shopping bag'} data-testid="drawer-cart">
    <div className="drawer-head"><h2>{confirmation ? 'On its way' : checkout ? 'Your details' : 'Your bag'}</h2><button type="button" className="icon-button" onClick={onClose} data-testid="button-close-cart" aria-label="Close bag"><X size={21} /></button></div>
     {confirmation ? <div className="order-success"><div className="success-mark"><Check size={30} /></div><h2>Order received.</h2><p>{confirmation} We’ll be in touch before your Clensory parcel leaves us.</p><button type="button" className="primary-button" onClick={onContinue} data-testid="button-continue-shopping">Continue browsing <ArrowRight size={15} /></button></div> : items.length === 0 ? <div className="cart-empty"><div><div className="empty-mark"><ShoppingBag size={25} /></div><h3>A little space.</h3><p>Your bag is ready when you are.<br />Start with something for the daily reset.</p><button type="button" className="secondary-button" onClick={onClose} data-testid="button-empty-continue">Explore the collection <ArrowRight size={14} /></button></div></div> : checkout ? <div className="checkout-view"><button type="button" className="back-link" onClick={onBack} data-testid="button-back-to-bag"><ArrowLeft size={13} /> Back to bag</button><h3 className="checkout-title">Where should we send it?</h3><p className="checkout-kicker">Thoughtful delivery across Pakistan, packed with care.</p><form className="checkout-form" onSubmit={onSubmit} noValidate>
       <div className="field"><label htmlFor="fullName">Full name</label><input id="fullName" value={shipping.fullName} onChange={(e) => update('fullName', e.target.value)} data-testid="input-full-name" placeholder="Your name" />{!shipping.fullName.trim() && <span className="field-error" hidden>Tell us your name</span>}</div>
       <div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" value={shipping.email} onChange={(e) => update('email', e.target.value)} data-testid="input-email" placeholder="you@example.com" /></div>
      <div className="field"><label htmlFor="phone">Phone number</label><input id="phone" value={shipping.phone} onChange={(e) => update('phone', e.target.value)} data-testid="input-phone" placeholder="03xx xxx xxxx" /></div>
      <div className="field"><label htmlFor="address">Delivery address</label><textarea id="address" value={shipping.address} onChange={(e) => update('address', e.target.value)} data-testid="input-address" placeholder="House, street, neighbourhood" /></div>
       <div className="form-row"><div className="field"><label htmlFor="city">City</label><select id="city" value={shipping.city} onChange={(e) => update('city', e.target.value)} data-testid="select-city"><option value="">Choose city</option><option>Lahore</option><option>Karachi</option><option>Islamabad</option><option>Rawalpindi</option><option>Faisalabad</option><option>Other Pakistan city</option></select></div><div className="field"><label htmlFor="province">Province</label><select id="province" value={shipping.province} onChange={(e) => update('province', e.target.value)} data-testid="select-province"><option value="">Choose province</option><option>Punjab</option><option>Sindh</option><option>Khyber Pakhtunkhwa</option><option>Balochistan</option><option>Islamabad Capital Territory</option><option>Gilgit-Baltistan</option><option>Azad Jammu and Kashmir</option></select></div></div>
       <div className="form-row"><div className="field"><label htmlFor="postalCode">Postal code</label><input id="postalCode" value={shipping.postalCode} onChange={(e) => update('postalCode', e.target.value)} data-testid="input-postal-code" placeholder="54000" /></div><div className="field"><label htmlFor="notes">Notes <span>(optional)</span></label><input id="notes" value={shipping.notes} onChange={(e) => update('notes', e.target.value)} data-testid="input-notes" placeholder="Gate code, timing..." /></div></div>
       <div className="payment-method"><div className="payment-label">Payment method</div><div className="payment-choice-grid"><label className={`payment-choice ${shipping.paymentMethod === 'cod' ? 'selected' : ''}`}><input type="radio" name="paymentMethod" value="cod" checked={shipping.paymentMethod === 'cod'} onChange={() => update('paymentMethod', 'cod')} /><span><strong>Cash on delivery</strong><small>Pay when your parcel arrives</small></span></label><label className={`payment-choice ${shipping.paymentMethod === 'card' ? 'selected' : ''}`}><input type="radio" name="paymentMethod" value="card" checked={shipping.paymentMethod === 'card'} onChange={() => update('paymentMethod', 'card')} /><span><strong>Debit or credit card</strong><small>Secure checkout through Stripe</small></span><CreditCard size={17} /></label></div></div>
        {shipping.paymentMethod === 'card' && <p className="payment-note">You’ll be redirected to Stripe’s secure checkout to enter your card details.</p>}
        {retryBlocked && <div className="payment-retry-blocked" data-testid="text-payment-retry-blocked"><p>We couldn’t confirm that the previous card session is closed. Check your billing history before starting another payment.</p><div className="payment-retry-actions">{canCheckPrevious && <button type="button" className="secondary-button" onClick={onCheckPrevious} disabled={isPending} data-testid="button-recheck-card-payment">{isPending ? 'Checking payment...' : 'Check payment again'}</button>}<button type="button" className="secondary-button" onClick={onViewBilling} data-testid="button-check-billing-before-retry">View billing history</button></div></div>}
      {error && <div className="field-error" data-testid="text-form-error">{error}</div>}
        <div className="cart-summary"><div className="summary-row"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><div className="summary-row"><span>Delivery</span><span>{delivery === 0 ? 'Complimentary' : formatPrice(delivery)}</span></div><div className="summary-row total"><span>Total</span><span>{formatPrice(total)}</span></div><button type="submit" className="primary-button" disabled={isPending || retryBlocked} data-testid="button-place-order">{retryBlocked ? 'Check billing history first' : isPending ? 'Sending your order...' : 'Place order'} <ArrowRight size={15} /></button></div>
     </form></div> : <><div className="cart-items">{items.map((item) => <div className="cart-item" key={item.variant.productId} data-testid={`row-cart-${item.variant.productId}`}><div className={`mini-product-image ${item.product.category}`}><img className="mini-product-photo" src={item.product.image} alt="" /></div><div><div className="cart-item-name">{item.product.name}</div><div className="cart-item-meta">{item.variant.size} · {formatPrice(item.variant.price)}</div><div className="qty-control"><button type="button" onClick={() => onChangeQty(item.variant.productId, -1)} data-testid={`button-decrease-${item.variant.productId}`} aria-label="Decrease quantity"><Minus size={12} /></button><span data-testid={`text-quantity-${item.variant.productId}`}>{item.quantity}</span><button type="button" onClick={() => onChangeQty(item.variant.productId, 1)} data-testid={`button-increase-${item.variant.productId}`} aria-label="Increase quantity"><Plus size={12} /></button></div></div><div className="line-total">{formatPrice(item.variant.price * item.quantity)}</div></div>)}</div><div className="cart-summary"><div className="summary-row"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><div className="summary-row"><span>Delivery</span><span>{delivery === 0 ? 'Complimentary' : formatPrice(delivery)}</span></div><p className="summary-note">{subtotal < 3000 ? `Add ${formatPrice(3000 - subtotal)} more for complimentary delivery.` : 'Complimentary delivery is included for this order.'}</p><div className="summary-row total"><span>Total</span><span>{formatPrice(total)}</span></div><button type="button" className="primary-button" onClick={onCheckout} data-testid="button-checkout">{isAuthenticated ? 'Continue to checkout' : 'Log in to checkout'} <ArrowRight size={15} /></button></div></>}
    </aside></>;
}

function Home() {
  const [initialDraft] = useState(readCheckoutDraft);
  const [cart, setCart] = useState<CartItem[]>(initialDraft.cart);
  const [selected, setSelected] = useState<Product | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [shipping, setShipping] = useState<Shipping>(initialDraft.shipping);
  const [formError, setFormError] = useState('');
  const [retryBlocked, setRetryBlocked] = useState(initialDraft.retryBlocked);
  const [recoveryOrderNumber, setRecoveryOrderNumber] = useState<string | null>(initialDraft.recoveryOrderNumber);
  const [confirmation, setConfirmation] = useState('');
  const auth = useAuth();
  const isAdmin = Boolean(auth.user && (
    auth.user.isAdmin ||
    (auth.user.email && adminEmails.has(auth.user.email.trim().toLowerCase()))
  ));
  const cancelCardOrder = useCancelCardOrder();
  const createOrder = useCreateOrder();
  const createCardCheckout = useCreateCardCheckout();
  const health = useHealthCheck();
  const billingHistory = useGetBillingHistory({ query: { queryKey: ['/api/orders'], enabled: auth.isAuthenticated && billingOpen } });
  const adminOrders = useGetAdminOrders({ query: { queryKey: ['/api/admin/orders'], enabled: Boolean(isAdmin && adminOpen) } });
  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const isSubmitting = createOrder.isPending || createCardCheckout.isPending || cancelCardOrder.isPending;

  const checkCancelledOrder = (orderNumber: string) => {
    cancelCardOrder.mutate({ data: { orderNumber } }, {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: billingHistory.queryKey });
        queryClient.invalidateQueries({ queryKey: adminOrders.queryKey });
        setRecoveryOrderNumber(null);
        setRetryBlocked(false);
        if (result.paid) {
          setConfirmation(`Your card payment for order ${result.orderNumber} was completed.`);
          setCart([]);
          setShipping(emptyShipping);
          setCheckout(false);
        } else {
          setFormError('The cancelled checkout is closed. Your saved bag is ready to retry.');
        }
      },
      onError: () => {
        setFormError('We couldn’t confirm that the previous card session is closed. Check billing history before retrying to avoid a duplicate payment.');
      },
    });
  };

  useEffect(() => { if (cartOpen) document.body.style.overflow = 'hidden'; else document.body.style.overflow = ''; return () => { document.body.style.overflow = ''; }; }, [cartOpen]);
  useEffect(() => { persistCheckoutDraft(cart, shipping, retryBlocked, recoveryOrderNumber); }, [cart, shipping, retryBlocked, recoveryOrderNumber]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const sessionId = params.get('session_id');
    if (!payment || !auth.isAuthenticated) return;
    window.history.replaceState({}, document.title, window.location.pathname);
    if (payment === 'cancelled') {
      setRetryBlocked(true);
      setFormError('Your card payment was cancelled. Your bag and details are saved so you can review them and retry.');
      setCartOpen(true);
      setCheckout(true);
      setConfirmation('');
      const orderNumber = params.get('order');
      if (orderNumber) {
        setRecoveryOrderNumber(orderNumber);
        checkCancelledOrder(orderNumber);
      } else {
        setFormError('We couldn’t locate the cancelled order. Check Billing history before retrying to avoid a duplicate payment.');
      }
      return;
    }
    if (payment === 'success' && sessionId) {
      getPaymentStatus({ sessionId }).then((result) => {
        setConfirmation(result.paid ? `Your card payment for order ${result.orderNumber} was successful.` : `Order ${result.orderNumber} is awaiting payment confirmation.`);
        setCartOpen(true);
        setCheckout(false);
        setFormError('');
        if (result.paid) {
          setCart([]);
          setShipping(emptyShipping);
          setRetryBlocked(false);
          setRecoveryOrderNumber(null);
        }
        queryClient.invalidateQueries({ queryKey: billingHistory.queryKey });
        queryClient.invalidateQueries({ queryKey: adminOrders.queryKey });
      }).catch(() => {
        setFormError('We received you back from Safe Pay, but could not confirm the payment yet.');
        setCartOpen(true);
      });
    }
  }, [auth.isAuthenticated]);
   const addToCart = (product: Product, variant: ProductVariant) => { setCart((current) => { const existing = current.find((item) => item.variant.productId === variant.productId); return existing ? current.map((item) => item.variant.productId === variant.productId ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product, variant, quantity: 1 }]; }); setCartOpen(true); };
   const changeQty = (variantId: string, delta: number) => setCart((current) => current.map((item) => item.variant.productId === variantId ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0));
  const openCatalog = () => { document.getElementById('collection')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); };
  const openCheckout = () => { if (!auth.isAuthenticated) { auth.login(); return; } setCheckout(true); setFormError(''); };
  const openBilling = () => { if (!auth.isAuthenticated) { auth.login(); return; } setBillingOpen(true); };
  const openAdmin = () => { if (!auth.isAuthenticated) { auth.login(); return; } if (isAdmin) setAdminOpen(true); };
  const submitOrder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!auth.isAuthenticated) { auth.login(); return; }
    if (shipping.fullName.trim().length < 2 || shipping.email.trim().length < 3 || shipping.phone.trim().length < 7 || shipping.address.trim().length < 5 || shipping.city.trim().length < 2 || shipping.province.trim().length < 2 || shipping.postalCode.trim().length < 3) {
      setFormError('Please complete your name, email, phone, address, city, province and postal code.');
      return;
    }
    setFormError('');
    const subtotal = cart.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);
    const deliveryFee = subtotal > 3000 ? 0 : 250;
    const data = { items: cart.map((item) => ({ productId: item.variant.productId, productName: `${item.product.name} — ${item.variant.size}`, quantity: item.quantity, unitPrice: item.variant.price })), shipping: { ...shipping, notes: shipping.notes || null }, subtotal, deliveryFee, total: subtotal + deliveryFee, paymentMethod: shipping.paymentMethod };
    const onSuccess = (result: { orderNumber: string }) => { setConfirmation(`Your order ${result.orderNumber} has been placed.`); setCart([]); setShipping(emptyShipping); queryClient.invalidateQueries({ queryKey: billingHistory.queryKey }); queryClient.invalidateQueries({ queryKey: adminOrders.queryKey }); };
    if (shipping.paymentMethod === 'card') {
      persistCheckoutDraft(cart, shipping, retryBlocked, recoveryOrderNumber);
      createCardCheckout.mutate({ data }, { onSuccess: (result) => { window.location.href = result.checkoutUrl; }, onError: () => setFormError('We couldn’t start secure card checkout just now. Please try again.') });
    } else {
      createOrder.mutate({ data }, { onSuccess, onError: () => setFormError('We couldn’t place that order just now. Please try again.') });
    }
  };
  const closeCart = () => { setCartOpen(false); setCheckout(false); };
  const viewBillingBeforeRetry = () => { closeCart(); openBilling(); };
  return <div className="storefront">
    <div className="announcement">Free delivery across Pakistan on orders over Rs. 3,000</div>
    <header className="site-header">
      <button className="mobile-menu" type="button" onClick={() => setMobileNavOpen((open) => !open)} data-testid="button-mobile-menu" aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileNavOpen} aria-controls="mobile-nav">{mobileNavOpen ? <X size={20} /> : <Menu size={20} />}</button>
      <button className="logo-crop" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} data-testid="button-logo-home" aria-label="Clensory home"><img src={logo} alt="Clensory Pakistan" /></button>
        <nav className="main-nav" aria-label="Main navigation"><button type="button" onClick={openCatalog} data-testid="link-shop">Shop</button><button type="button" onClick={() => document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' })} data-testid="link-our-approach">Our approach</button><button type="button" onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })} data-testid="link-reviews">Reviews</button><button type="button" onClick={openBilling} data-testid="link-billing-history">Billing history</button>{isAdmin && <button type="button" onClick={openAdmin} data-testid="link-track-orders">Track orders</button>}</nav>
       <div className="header-tools">{auth.isAuthenticated ? <button type="button" className="header-action account-action" onClick={() => { sessionStorage.removeItem(checkoutDraftStorageKey); auth.logout(); }} data-testid="button-log-out" title="Log out"><LogOut size={14} /> Log out</button> : <button type="button" className="header-action account-action" onClick={auth.login} data-testid="button-log-in" title="Log in or create an account"><LogIn size={14} /> Log in</button>}<span className="header-action service-status" aria-label="Service status"><span className="health-dot" />{health.isLoading ? 'Here for you' : 'Pakistan made'}</span><button type="button" className="header-action bag-button" onClick={() => setCartOpen(true)} data-testid="button-open-cart"><ShoppingBag size={18} /><span>Bag</span>{itemCount > 0 && <span className="bag-count" data-testid="text-cart-count">{itemCount}</span>}</button></div>
    </header>
    <nav id="mobile-nav" className={`mobile-nav${mobileNavOpen ? ' open' : ''}`} aria-label="Mobile navigation" aria-hidden={!mobileNavOpen}>
      <button type="button" onClick={openCatalog} data-testid="mobile-link-shop">Shop</button>
      <button type="button" onClick={() => { document.getElementById('story')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); }} data-testid="mobile-link-our-approach">Our approach</button>
      <button type="button" onClick={() => { document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' }); setMobileNavOpen(false); }} data-testid="mobile-link-reviews">Reviews</button>
      <button type="button" onClick={() => { openBilling(); setMobileNavOpen(false); }} data-testid="mobile-link-billing-history">Billing history</button>
      {isAdmin && <button type="button" onClick={() => { openAdmin(); setMobileNavOpen(false); }} data-testid="mobile-link-track-orders">Track orders</button>}
    </nav>
    {isAdmin && <div className="admin-mobile-shortcut"><span>Admin workspace</span><button type="button" onClick={openAdmin} data-testid="mobile-shortcut-track-orders"><Receipt size={15} /> Track orders <ArrowRight size={14} /></button></div>}
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow">A calmer way to clean · from Pakistan</div><h1>Clean,<br /><em>thoughtfully.</em></h1><p className="hero-intro">Everyday home care, made with a lighter touch. Considered formulas, quiet scents and objects you’ll be happy to leave out.</p><button type="button" className="primary-button" onClick={openCatalog} data-testid="button-hero-shop">Shop the collection <ArrowRight size={16} /></button></div>
       <div className="hero-visual"><div className="bubble-field" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div><div className="leaf-line"><i /><i /><i /><i /></div><div className="hero-product hero-products"><div className="bottle hero-bottle-clenso"><div className="bottle-label">Clenso<small>Dishwash cleaner</small></div></div><div className="bottle hero-bottle-laundro"><div className="bottle-label">Laundro<small>Laundry detergent</small></div></div></div><div className="hero-stamp">good for<br />your rituals</div><div className="scroll-cue">scroll to explore</div></div>
      </section>
      <section className="trust-bar"><div className="trust-item"><Truck size={18} /> Nationwide delivery, made simple</div><div className="trust-item"><Leaf size={18} /> Plant-led, home-friendly formulas</div><div className="trust-item"><ShieldCheck size={18} /> A small brand you can trust</div></section>
      <section className="catalog" id="collection">
         <div className="section-heading"><div><div className="eyebrow">The collection</div><h2>Two essentials.<br />Made well.</h2></div><p>Meet the first two Clensory staples for the rituals that keep home.</p></div>
        <div className="product-grid">{products.map((product) => <ProductCard key={product.id} product={product} onDetail={setSelected} onAdd={addToCart} />)}</div>
      </section>
       <section className="story" id="story"><div className="story-copy"><div className="eyebrow">Our approach</div><h2>Less noise.<br />More care.</h2><p>Clensory began with a simple belief: cleaning products can be effective without being aggressive, and useful without becoming clutter. We make the things you reach for every day feel a little more considered.</p><p className="mission-note">Our mission is to save water while providing the best results. Clenso and Laundro need less water to clean, yet they clean dishes and clothes thoroughly, leaving them smelling good.</p><button type="button" className="secondary-button" onClick={openCatalog} data-testid="button-story-shop">Find your everyday essentials <ArrowRight size={14} /></button></div><div className="story-art"><div className="leaf-art"><i /><i /><i /></div></div></section>
      <section className="reviews" id="reviews"><div className="section-heading"><div><div className="eyebrow">Kind words</div><h2>Good things,<br />from real homes.</h2></div><p>Small rituals. Noticeable difference. Here’s what the Clensory community is saying.</p></div><div className="review-grid"><div className="review-feature"><div className="rating"><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /><Star size={13} fill="currentColor" /></div><blockquote>“It’s the first time I’ve wanted to keep my cleaning products on the counter.”</blockquote><cite>— Noor, Islamabad</cite></div><div className="review-list"><div className="review-small"><div className="rating"><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /></div><p>“Gentle scent, genuinely clean finish.”</p><cite>— Maham, Karachi</cite></div><div className="review-small"><div className="rating"><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /><Star size={12} fill="currentColor" /></div><p>“Thoughtful packaging and quick delivery.”</p><cite>— Rabia, Lahore</cite></div></div></div></section>
    </main>
    <footer className="site-footer"><div className="footer-logo">Clensory.</div><div>Made in Pakistan · Clean, thoughtfully.</div><div>© 2024 Clensory</div></footer>
    {selected && <ProductDetail product={selected} onClose={() => setSelected(null)} onAdd={addToCart} />}
      {cartOpen && <CartDrawer items={cart} onClose={closeCart} onChangeQty={changeQty} onCheckout={openCheckout} checkout={checkout} onBack={() => setCheckout(false)} shipping={shipping} setShipping={setShipping} onSubmit={submitOrder} isPending={isSubmitting} retryBlocked={retryBlocked} onViewBilling={viewBillingBeforeRetry} onCheckPrevious={() => { if (recoveryOrderNumber) checkCancelledOrder(recoveryOrderNumber); }} canCheckPrevious={Boolean(recoveryOrderNumber)} error={formError} confirmation={confirmation} onContinue={() => { setConfirmation(''); closeCart(); openCatalog(); }} isAuthenticated={auth.isAuthenticated} />}
     {billingOpen && auth.user && <BillingHistoryWindow records={billingHistory.data ?? []} isLoading={billingHistory.isLoading} isError={billingHistory.isError} user={auth.user} onClose={() => setBillingOpen(false)} />}
       {adminOpen && isAdmin && <AdminOrderTrackingWindow records={adminOrders.data ?? []} isLoading={adminOrders.isLoading} isError={adminOrders.isError} onClose={() => setAdminOpen(false)} />}
        <AuthModal open={auth.authModalOpen} onClose={() => auth.setAuthModalOpen(false)} onSuccess={auth.refreshUser} />
  </div>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><ErrorBoundary resetKey="home"><Home /></ErrorBoundary><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
