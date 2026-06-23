import { AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export function EmergencyButton() {
  const navigate = useNavigate();

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => navigate('/report?severity=critical&category=emergency')}
      className="relative flex items-center justify-center w-14 h-14 rounded-full bg-severity-critical glow-critical"
    >
      <div className="absolute inset-0 rounded-full bg-severity-critical/30 animate-ping" />
      <AlertTriangle className="h-6 w-6 text-foreground relative z-10" />
    </motion.button>
  );
}
