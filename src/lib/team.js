export function getOwnerUserId(user) {
  if (!user) return null
  return user.ParentUserId || user.id || null
}

export function isOwnerUser(user) {
  if (!user) return false
  return !user.ParentUserId
}

export function isTeamMemberUser(user) {
  if (!user) return false
  return Boolean(user.ParentUserId)
}
