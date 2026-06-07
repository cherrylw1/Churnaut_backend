UPDATE clients c
SET email = lower(u.email)
FROM auth.users u
WHERE u.id = c.id AND (c.email IS NULL OR c.email = '');
