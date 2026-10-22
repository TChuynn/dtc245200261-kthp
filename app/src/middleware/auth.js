function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }
    if (req.session.user.role !== role) {
      return res.status(403).render('error', {
        title: '403 - Không Có Quyền Truy Cập',
        message: 'Bạn không có quyền thực hiện chức năng này.',
        statusCode: 403,
      });
    }
    next();
  };
}

function redirectIfAuth(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'admin') {
      return res.redirect('/admin/reports');
    }
    return res.redirect('/staff/dashboard');
  }
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  redirectIfAuth,
};
