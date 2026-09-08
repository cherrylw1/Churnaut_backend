ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_test_data boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_clients_test_data ON public.clients(is_test_data);
