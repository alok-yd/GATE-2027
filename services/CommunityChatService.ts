import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { cloudAuth, cloudDb, cloudStorage } from './CloudSyncService';

export interface CommunityRoom {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  sortOrder: number;
  visibility: 'public';
}

export interface CommunityAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  kind: 'image' | 'document';
  storagePath: string;
}

export interface CommunityMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderPhotoURL: string;
  text: string;
  attachments: CommunityAttachment[];
  createdAt: Timestamp | null;
  replyToMessageId: string;
  replyToSenderName: string;
  replyToText: string;
}

export interface CommunityMember {
  uid: string;
  displayName: string;
  photoURL: string;
  role: 'member';
  joinedAt: Timestamp | null;
}

const DEFAULT_ROOMS: Omit<CommunityRoom, 'id' | 'visibility'>[] = [
  { slug: 'general-community', name: 'General Community', description: 'Introductions, preparation updates and general GATE conversations.', category: 'General', sortOrder: 1 },
  { slug: 'doubt-solving', name: 'Doubt Solving', description: 'Ask questions, explain concepts and help fellow aspirants.', category: 'General', sortOrder: 2 },
  { slug: 'pyq-discussion', name: 'PYQ Discussion', description: 'Discuss previous-year questions, approaches and tricky options.', category: 'Practice', sortOrder: 3 },
  { slug: 'mock-test-analysis', name: 'Mock Test Analysis', description: 'Discuss mock-test mistakes, strategies and time management.', category: 'Practice', sortOrder: 4 },
  { slug: 'c-programming', name: 'C Programming', description: 'Pointers, arrays, expressions, storage classes and output questions.', category: 'Computer Science', sortOrder: 5 },
  { slug: 'data-structures', name: 'Data Structures', description: 'Trees, graphs, hashing, stacks, queues and complexity.', category: 'Computer Science', sortOrder: 6 },
  { slug: 'algorithms', name: 'Algorithms', description: 'Greedy, dynamic programming, graphs, sorting and analysis.', category: 'Computer Science', sortOrder: 7 },
  { slug: 'dbms', name: 'DBMS', description: 'SQL, normalization, transactions, indexing and relational algebra.', category: 'Computer Science', sortOrder: 8 },
  { slug: 'operating-systems', name: 'Operating Systems', description: 'Processes, threads, scheduling, synchronization, memory and files.', category: 'Computer Science', sortOrder: 9 },
  { slug: 'computer-organization', name: 'COA', description: 'Pipelining, cache, memory hierarchy, instructions and I/O.', category: 'Computer Science', sortOrder: 10 },
  { slug: 'computer-networks', name: 'Computer Networks', description: 'TCP/IP, routing, congestion control, protocols and numericals.', category: 'Computer Science', sortOrder: 11 },
  { slug: 'toc-compiler-design', name: 'TOC & Compiler Design', description: 'Automata, grammars, decidability, parsing and code generation.', category: 'Computer Science', sortOrder: 12 },
  { slug: 'discrete-mathematics', name: 'Discrete Mathematics', description: 'Logic, sets, relations, combinatorics, graphs and recurrence.', category: 'Mathematics', sortOrder: 13 },
  { slug: 'engineering-mathematics', name: 'Engineering Mathematics', description: 'Linear algebra, calculus, probability and numerical methods.', category: 'Mathematics', sortOrder: 14 },
  { slug: 'data-science-ai', name: 'Data Science & AI', description: 'Probability, statistics, machine learning and artificial intelligence.', category: 'Data Science & AI', sortOrder: 15 },
  { slug: 'gate-da', name: 'GATE DA', description: 'Dedicated discussions for Data Science and Artificial Intelligence.', category: 'Data Science & AI', sortOrder: 16 },
];

const requireSignedInUser = () => {
  const user = cloudAuth.currentUser;
  if (!user) throw new Error('Sign in to ACHIEVER before using Community.');
  return user;
};

const roomRef = (roomId: string) => doc(cloudDb, 'communityRooms', roomId);
const memberRef = (roomId: string, uid: string) =>
  doc(cloudDb, 'communityRooms', roomId, 'members', uid);

export const ensureDefaultCommunityRooms = async (): Promise<void> => {
  const user = requireSignedInUser();
  await runTransaction(cloudDb, async (transaction) => {
    const roomRefs = DEFAULT_ROOMS.map((room) => roomRef(room.slug));
    const snapshots = [];
    for (const ref of roomRefs) snapshots.push(await transaction.get(ref));

    snapshots.forEach((snapshot, index) => {
      if (!snapshot.exists()) {
        const room = DEFAULT_ROOMS[index];
        transaction.set(roomRefs[index], {
          ...room,
          visibility: 'public',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
        });
      }
    });
  });
};

export const subscribeToCommunityRooms = (
  onRooms: (rooms: CommunityRoom[]) => void,
  onError: (error: Error) => void
) => onSnapshot(
  query(collection(cloudDb, 'communityRooms'), orderBy('sortOrder', 'asc')),
  (snapshot) => onRooms(snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<CommunityRoom, 'id'>),
  }))),
  (error) => onError(error)
);

export const getCommunityMembership = async (roomId: string): Promise<boolean> => {
  const user = requireSignedInUser();
  const snapshot = await getDoc(memberRef(roomId, user.uid));
  return snapshot.exists();
};

export const joinCommunityRoom = async (roomId: string): Promise<void> => {
  const user = requireSignedInUser();
  const reference = memberRef(roomId, user.uid);
  await runTransaction(cloudDb, async (transaction) => {
    const [roomSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(roomRef(roomId)),
      transaction.get(reference),
    ]);
    if (!roomSnapshot.exists() || roomSnapshot.data().visibility !== 'public') {
      throw new Error('This study room is not available to join.');
    }
    if (memberSnapshot.exists()) return;

    const displayName = user.displayName?.trim() || 'GATE Student';
    transaction.set(reference, {
      uid: user.uid,
      displayName: displayName.slice(0, 60),
      photoURL: user.photoURL || '',
      role: 'member',
      joinedAt: serverTimestamp(),
    });
  });
};

export const leaveCommunityRoom = async (roomId: string): Promise<void> => {
  const user = requireSignedInUser();
  await deleteDoc(memberRef(roomId, user.uid));
};

export const subscribeToRoomMessages = (
  roomId: string,
  onMessages: (messages: CommunityMessage[]) => void,
  onError: (error: Error) => void
) => onSnapshot(
  query(
    collection(cloudDb, 'communityRooms', roomId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(60)
  ),
  (snapshot) => {
    const messages = snapshot.docs.map((item) => {
      const data = item.data();
      return {
        id: item.id,
        ...(data as Omit<CommunityMessage, 'id'>),
        attachments: Array.isArray(data.attachments) ? data.attachments as CommunityAttachment[] : [],
      };
    }).reverse();
    onMessages(messages);
  },
  (error) => onError(error)
);

export const subscribeToRoomMembers = (
  roomId: string,
  onMembers: (members: CommunityMember[]) => void,
  onError: (error: Error) => void
) => onSnapshot(
  query(
    collection(cloudDb, 'communityRooms', roomId, 'members'),
    orderBy('joinedAt', 'asc'),
    limit(50)
  ),
  (snapshot) => onMembers(snapshot.docs.map((item) => item.data() as CommunityMember)),
  (error) => onError(error)
);

const COMMUNITY_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const COMMUNITY_ATTACHMENT_MAX_COUNT = 4;
const COMMUNITY_ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

const getCommunityFileType = (file: File): string => {
  if (file.type && COMMUNITY_ALLOWED_TYPES.has(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const extensionTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
  };
  return extensionTypes[extension] || '';
};

const safeCommunityFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._() -]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'attachment';

const createAttachmentId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

export const getCommunityAttachmentUrl = async (storagePath: string): Promise<string> => {
  if (!storagePath.startsWith('communityRooms/')) {
    throw new Error('This attachment does not belong to a Community room.');
  }
  requireSignedInUser();
  return getDownloadURL(ref(cloudStorage, storagePath));
};

export const sendCommunityMessage = async (
  roomId: string,
  text: string,
  files: File[] = [],
  replyTo?: Pick<CommunityMessage, 'id' | 'senderName' | 'text'>
): Promise<void> => {
  const user = requireSignedInUser();
  const cleanText = text.trim();
  if (!cleanText && files.length === 0) {
    throw new Error('Write a message or attach a file before sending.');
  }
  if (cleanText.length > 4000) throw new Error('Messages must be 4,000 characters or fewer.');
  if (files.length > COMMUNITY_ATTACHMENT_MAX_COUNT) {
    throw new Error('Attach up to 4 files per message.');
  }

  const uploadedAttachments: CommunityAttachment[] = [];
  try {
    for (const file of files) {
      const contentType = getCommunityFileType(file);
      if (!contentType) {
        throw new Error('Unsupported file type. Attach PNG, JPG, WEBP, PDF, DOC, DOCX, TXT, MD or CSV files.');
      }
      if (file.size <= 0 || file.size > COMMUNITY_ATTACHMENT_MAX_BYTES) {
        throw new Error('Each attachment must be between 1 byte and 10 MB.');
      }

      const attachmentId = createAttachmentId();
      const storagePath = 'communityRooms/' + roomId + '/attachments/' + user.uid + '/' + attachmentId;
      const fileRef = ref(cloudStorage, storagePath);
      await uploadBytes(fileRef, file, {
        contentType,
        customMetadata: {
          uploadedBy: user.uid,
          roomId,
          originalName: safeCommunityFileName(file.name),
        },
      });

      uploadedAttachments.push({
        id: attachmentId,
        name: safeCommunityFileName(file.name),
        contentType,
        size: file.size,
        kind: contentType.startsWith('image/') ? 'image' : 'document',
        storagePath,
      });
    }

    await addDoc(collection(cloudDb, 'communityRooms', roomId, 'messages'), {
      senderUid: user.uid,
      senderName: (user.displayName?.trim() || 'GATE Student').slice(0, 60),
      senderPhotoURL: user.photoURL || '',
      text: cleanText,
      attachments: uploadedAttachments,
      createdAt: serverTimestamp(),
      replyToMessageId: replyTo?.id || '',
      replyToSenderName: replyTo?.senderName || '',
      replyToText: replyTo?.text.slice(0, 240) || '',
    });
  } catch (error) {
    await Promise.allSettled(
      uploadedAttachments.map((attachment) =>
        deleteObject(ref(cloudStorage, attachment.storagePath))
      )
    );
    throw error;
  }
};

export const deleteCommunityMessage = async (roomId: string, messageId: string): Promise<void> => {
  const user = requireSignedInUser();
  const messageReference = doc(cloudDb, 'communityRooms', roomId, 'messages', messageId);
  const messageSnapshot = await getDoc(messageReference);
  if (!messageSnapshot.exists()) return;
  const data = messageSnapshot.data();
  if (data.senderUid !== user.uid) {
    throw new Error('You can delete only your own messages.');
  }

  const attachments = Array.isArray(data.attachments)
    ? data.attachments as CommunityAttachment[]
    : [];
  await deleteDoc(messageReference);
  await Promise.allSettled(
    attachments
      .filter((attachment) => typeof attachment.storagePath === 'string')
      .map((attachment) => deleteObject(ref(cloudStorage, attachment.storagePath)))
  );
};
