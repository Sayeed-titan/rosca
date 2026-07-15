/**
 * Member DTOs — the Server/Client serialization boundary.
 *
 * Dates become ISO strings and BigInts become strings here, because React cannot
 * serialize either across the RSC boundary. Doing it in one place beats scattering
 * `.toISOString()` through the components and discovering the one that was missed
 * at runtime.
 *
 * It's also a privacy boundary: only listed fields cross. A `select *` habit is how
 * internal columns end up in a browser payload.
 */
export function toMemberDto(member) {
  return {
    id: member.id,
    fullName: member.fullName,
    phone: member.phone,
    email: member.email,
    nationalId: member.nationalId,
    address: member.address,
    occupation: member.occupation,
    emergencyContact: member.emergencyContact,
    photoUrl: member.photoUrl,
    notes: member.notes,
    status: member.status,
    joiningDate: member.joiningDate?.toISOString() ?? null,
    createdAt: member.createdAt?.toISOString() ?? null,
    hasPortalAccess: Boolean(member.userId),
    committeeCount: member._count?.committeeMembers ?? 0,
  };
}

/** Shape the edit form expects: date inputs need "YYYY-MM-DD", never null. */
export function toMemberFormValues(dto) {
  return {
    fullName: dto.fullName ?? "",
    phone: dto.phone ?? "",
    email: dto.email ?? "",
    nationalId: dto.nationalId ?? "",
    address: dto.address ?? "",
    occupation: dto.occupation ?? "",
    emergencyContact: dto.emergencyContact ?? "",
    photoUrl: dto.photoUrl ?? "",
    notes: dto.notes ?? "",
    status: dto.status ?? "ACTIVE",
    joiningDate: dto.joiningDate ? dto.joiningDate.slice(0, 10) : "",
  };
}
