import { lazy, createSignal, onCleanup, onMount } from 'solid-js';

const Home = lazy(() => import('./pages/Home.tsx'));
const Login = lazy(() => import('./pages/Login.tsx'));
const Signup = lazy(() => import('./pages/Signup.tsx'));
const EmailVerification = lazy(() => import('./pages/EmailVerification.tsx'));
const Chat = lazy(() => import('./pages/Chat.tsx'));
const CreateRoom = lazy(() => import('./pages/CreateRoom.tsx'));

export default function App() {
  const [path, setPath] = createSignal(window.location.pathname);
  const onPop = () => setPath(window.location.pathname);
  onMount(() => window.addEventListener('popstate', onPop));
  onCleanup(() => window.removeEventListener('popstate', onPop));

  const p = () => path();
  
  // Route to home for root path
  if (p() === '/') return <Home />;
  if (p().startsWith('/login')) return <Login />;
  if (p().startsWith('/signup')) return <Signup />;
  if (p().startsWith('/verify-email')) return <EmailVerification />;
  if (p().startsWith('/create-room')) return <CreateRoom />;
  if (p().startsWith('/chat/')) return <Chat />;
  
  return <div>Not Found</div>;
}