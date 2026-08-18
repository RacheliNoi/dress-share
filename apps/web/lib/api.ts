export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export type DressPhoto = {
  id: number;
  originalUrl: string;
  processedUrl: string | null;
  sortOrder: number;
};

export type DressSize = {
  id: number;
  size: string;
  price: number;
};

export type DressStatus =
  | "DRAFT"
  | "AI_PROCESSING"
  | "AI_READY"
  | "OWNER_REVIEW"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type Dress = {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  color: string | null;
  status: DressStatus;
  rejectionReason: string | null;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
  photos: DressPhoto[];
  sizes: DressSize[];
};

export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  token?: string;
  headers?: Record<string, string>;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { token, headers, body, ...rest } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    body,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      (data && data.message) || "אירעה שגיאה, נסי שוב",
      response.status,
    );
  }

  return data as T;
}

export function login(email: string, password: string) {
  return request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(name: string, email: string, password: string) {
  return request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function changePassword(
  token: string,
  data: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
) {
  return request<{ message: string }>("/auth/change-password", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function requestPasswordReset(email: string) {
  return request<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(data: {
  token: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return request<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getApprovedDresses() {
  return request<Dress[]>("/dresses/approved");
}

// There is no GET /dresses/:id endpoint on the backend, so a single
// dress is resolved by fetching the approved catalog and matching the id.
export async function getApprovedDressById(id: number) {
  const dresses = await getApprovedDresses();
  return dresses.find((dress) => dress.id === id);
}

export function getDressImageUrl(photo: DressPhoto) {
  return `${API_URL}${photo.processedUrl ?? photo.originalUrl}`;
}

// Mirrors exactly what GET /bookings/dress/:dressId/availability returns -
// no renterId, no user details, nothing beyond what that public endpoint
// actually sends.
export type DressAvailabilityStatus = "INTERESTED" | "RENTED";

export type DressAvailabilityEntry = {
  startDate: string;
  endDate: string;
  status: DressAvailabilityStatus;
  // Which DressSize this booking holds - null means either a dress with no
  // sizes defined (whole-dress booking, unchanged legacy behavior) or a
  // booking made before per-size tracking existed. Never private (no
  // renterId/price here) - size is a physical dress attribute, not who
  // booked it.
  size: string | null;
};

export function getDressAvailability(dressId: number) {
  return request<DressAvailabilityEntry[]>(
    `/bookings/dress/${dressId}/availability`,
  );
}

// The full Booking record, as returned by the owner-only
// GET /bookings/dress/:dressId (unlike the public availability endpoint,
// this includes renterId/size/price - only ever fetched with an owner's
// token, and the backend re-checks ownership on every call regardless).
export type BookingStatus =
  | "INTERESTED"
  | "RENTED"
  | "CANCELLED"
  | "PENDING"
  | "CONFIRMED"
  | "COMPLETED";

export type Booking = {
  id: number;
  dressId: number;
  renterId: number | null;
  size: string | null;
  startDate: string;
  endDate: string;
  price: number | null;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
};

export function getDressBookings(token: string, dressId: number) {
  return request<Booking[]>(`/bookings/dress/${dressId}`, { token });
}

export function createInterestedBooking(
  token: string,
  data: { dressId: number; startDate: string; endDate: string; size?: string },
) {
  return request<Booking>("/bookings/interested", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function createRentedBooking(
  token: string,
  data: {
    dressId: number;
    startDate: string;
    endDate: string;
    size?: string;
    price?: number;
  },
) {
  return request<Booking>("/bookings/rented", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function markBookingAsRented(
  token: string,
  bookingId: number,
  data: { size?: string; price?: number } = {},
) {
  return request<Booking>(`/bookings/${bookingId}/rent`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export function cancelBooking(token: string, bookingId: number) {
  return request<Booking>(`/bookings/${bookingId}`, {
    method: "DELETE",
    token,
  });
}

export function getMyDresses(token: string) {
  return request<Dress[]>("/dresses", { token });
}

export function createDress(
  token: string,
  data: {
    name: string;
    description?: string;
    category?: string;
    color?: string;
  },
) {
  return request<Dress>("/dresses", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function addDressSize(
  token: string,
  dressId: number,
  data: { size: string; price: number },
) {
  return request<DressSize>(`/dresses/${dressId}/sizes`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function updateDressSize(
  token: string,
  dressId: number,
  sizeId: number,
  data: { size?: string; price?: number },
) {
  return request<DressSize>(`/dresses/${dressId}/sizes/${sizeId}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteDressSize(token: string, dressId: number, sizeId: number) {
  return request<DressSize>(`/dresses/${dressId}/sizes/${sizeId}`, {
    method: "DELETE",
    token,
  });
}

export function addDressPhotos(token: string, dressId: number, files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append("images", file));

  return request<{ count: number }>(`/dresses/${dressId}/photos`, {
    method: "POST",
    token,
    body: formData,
  });
}

export function updateDress(
  token: string,
  dressId: number,
  data: {
    name?: string;
    description?: string;
    category?: string;
    color?: string;
  },
) {
  return request<Dress>(`/dresses/${dressId}/update`, {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function submitDressForApproval(token: string, dressId: number) {
  return request<Dress>(`/dresses/${dressId}/submit`, {
    method: "POST",
    token,
  });
}

export function deleteDressPhoto(
  token: string,
  dressId: number,
  photoId: number,
) {
  return request<DressPhoto>(`/dresses/${dressId}/photos/${photoId}`, {
    method: "DELETE",
    token,
  });
}

export type PendingDress = Dress & {
  owner: { id: number; name: string | null; email: string };
};

export function getPendingDresses(token: string) {
  return request<PendingDress[]>("/admin/dresses/pending", { token });
}

export function approveDress(token: string, dressId: number) {
  return request<Dress>(`/admin/dresses/${dressId}/approve`, {
    method: "PATCH",
    token,
  });
}

export function rejectDress(token: string, dressId: number, reason: string) {
  return request<Dress>(`/admin/dresses/${dressId}/reject`, {
    method: "PATCH",
    token,
    body: JSON.stringify({ reason }),
  });
}
