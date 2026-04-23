import { useState, useRef, useEffect } from 'react';
import { Modal, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { Upload, X, FileText, Calendar, ClipboardList, AlertCircle, CheckCircle, Loader2, Users, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';
import { useUploadFileMutation } from '@/api/filesApi';
import { useCreateAssignmentMutation } from '@/api/assignmentsApi';
import { useGetAuthTeacherTeachingSubjectsQuery } from '@/api/teachersApi';
import { useGetDefaultSemesterQuery } from '@/api/semestersApi';

interface CreateAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    classSubjectId: string;
    subjectId?: string;
    slotId?: string;
    slotTitle?: string;
    existingCount?: number;
}

export default function CreateAssignmentModal({
    isOpen,
    onClose,
    classSubjectId,
    subjectId,
    slotId,
    slotTitle,
    existingCount = 0,
}: CreateAssignmentModalProps) {
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [instanceNumber, setInstanceNumber] = useState(existingCount + 1);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Multi-class selection
    const [selectedClassSubjectIds, setSelectedClassSubjectIds] = useState<string[]>([classSubjectId]);

    const [uploadFile, { isLoading: isUploading }] = useUploadFileMutation();
    const [createAssignment, { isLoading: isCreating }] = useCreateAssignmentMutation();

    const { data: defaultSemester } = useGetDefaultSemesterQuery();
    const { data: teachingData } = useGetAuthTeacherTeachingSubjectsQuery(
        { semesterId: defaultSemester?.id },
        { skip: !defaultSemester?.id || !subjectId }
    );

    // Sibling class-subjects (same subject, excluding current one)
    const siblingClasses = teachingData?.subjects
        ?.find((s: any) => s.subjectId === subjectId)
        ?.classes?.filter((c: any) => c.classSubjectId !== classSubjectId) || [];

    const isSubmitting = isUploading || isCreating;

    // Keep current class always selected; sync on open
    useEffect(() => {
        if (isOpen) {
            setSelectedClassSubjectIds([classSubjectId]);
        }
    }, [isOpen, classSubjectId]);

    const handleClose = () => {
        if (isSubmitting) return;
        resetForm();
        onClose();
    };

    const resetForm = () => {
        setDescription('');
        setDueDate('');
        setInstanceNumber(existingCount + 1);
        setSelectedFile(null);
        setUploadProgress('idle');
        setSelectedClassSubjectIds([classSubjectId]);
    };

    const toggleSiblingClass = (id: string) => {
        setSelectedClassSubjectIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const toggleAllSiblings = () => {
        const allIds = [classSubjectId, ...siblingClasses.map((c: any) => c.classSubjectId)];
        if (selectedClassSubjectIds.length === allIds.length) {
            setSelectedClassSubjectIds([classSubjectId]);
        } else {
            setSelectedClassSubjectIds(allIds);
        }
    };

    const handleFileSelect = (file: File) => {
        setSelectedFile(file);
        setUploadProgress('idle');
    };

    const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleSubmit = async () => {
        if (!description.trim()) {
            toast.error('Please enter a description for the assignment.');
            return;
        }
        if (selectedClassSubjectIds.length === 0) {
            toast.error('Please select at least one class.');
            return;
        }

        try {
            let attachedFileId = undefined;

            if (selectedFile) {
                setUploadProgress('uploading');
                const fileResult = await uploadFile({ file: selectedFile, folder: 'assignments' }).unwrap();
                setUploadProgress('done');
                attachedFileId = fileResult.id;
            }

            await createAssignment({
                classSubjectIds: selectedClassSubjectIds,
                slotId: slotId || undefined,
                attachedFileId,
                instanceNumber,
                description: description.trim(),
                dueDate: dueDate ? dayjs(dueDate).format('YYYY-MM-DDTHH:mm:ss') : undefined,
            }).unwrap();

            const classCount = selectedClassSubjectIds.length;
            toast.success(
                classCount > 1
                    ? `Assignment ${instanceNumber} created for ${classCount} classes!`
                    : `Assignment ${instanceNumber} created successfully!`
            );
            resetForm();
            onClose();
        } catch (error: any) {
            setUploadProgress('error');
            const message = error?.data?.message || error?.message || 'Failed to create assignment.';
            toast.error(message);
        }
    };

    const getUploadIcon = () => {
        switch (uploadProgress) {
            case 'uploading':
                return <Loader2 className="w-5 h-5 text-[#F37022] animate-spin" />;
            case 'done':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'error':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
            default:
                return <FileText className="w-5 h-5 text-gray-400" />;
        }
    };

    const allIds = [classSubjectId, ...siblingClasses.map((c: any) => c.classSubjectId)];
    const allSelected = selectedClassSubjectIds.length === allIds.length;

    return (
        <Modal
            title={
                <div className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5 text-[#F37022]" />
                    <span className="font-bold text-[#0A1B3C]">
                        Create Assignment
                        {slotTitle ? ` — ${slotTitle}` : ''}
                    </span>
                </div>
            }
            open={isOpen}
            onCancel={handleClose}
            footer={null}
            width={640}
            centered
            closable={!isSubmitting}
            maskClosable={!isSubmitting}
        >
            <div className="py-4 space-y-5">
                {/* Multi-class Selector */}
                {siblingClasses.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-[#0A1B3C] flex items-center gap-1.5">
                                <Users className="w-4 h-4 text-gray-400" />
                                Apply to Classes
                            </label>
                            <button
                                type="button"
                                onClick={toggleAllSiblings}
                                disabled={isSubmitting}
                                className="text-xs text-[#F37022] font-semibold hover:underline disabled:opacity-50"
                            >
                                {allSelected ? 'Deselect all' : 'Select all'}
                            </button>
                        </div>
                        <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                            {/* Current class — always checked, not toggleable */}
                            <div className="flex items-center gap-3 px-4 py-3 bg-orange-50/60">
                                <CheckSquare className="w-4 h-4 text-[#F37022] flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-[#0A1B3C]">
                                        {/* Will be filled by the parent via classSubjectId; show placeholder */}
                                        Current class
                                    </span>
                                    <span className="ml-2 text-xs text-[#F37022] font-semibold bg-orange-100 px-1.5 py-0.5 rounded">Current</span>
                                </div>
                            </div>
                            {siblingClasses.map((cls: any) => {
                                const checked = selectedClassSubjectIds.includes(cls.classSubjectId);
                                return (
                                    <button
                                        key={cls.classSubjectId}
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => toggleSiblingClass(cls.classSubjectId)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${checked ? 'bg-blue-50/50' : 'hover:bg-gray-50'} disabled:opacity-60`}
                                    >
                                        {checked
                                            ? <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                            : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                        }
                                        <span className="text-sm font-medium text-gray-800">
                                            {cls.classCode || cls.classSubjectId}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedClassSubjectIds.length > 1 && (
                            <p className="text-xs text-blue-600 font-semibold mt-1.5 flex items-center gap-1">
                                <Users className="w-3.5 h-3.5" />
                                Will create assignment for {selectedClassSubjectIds.length} classes simultaneously
                            </p>
                        )}
                    </div>
                )}

                {/* Instance Number */}
                <div>
                    <label className="block text-sm font-semibold text-[#0A1B3C] mb-1.5">
                        Assignment Number
                    </label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min={1}
                            max={99}
                            value={instanceNumber}
                            onChange={(e) => setInstanceNumber(Number(e.target.value))}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#F37022] focus:ring-2 focus:ring-orange-100 outline-none"
                            disabled={isSubmitting}
                        />
                        <span className="text-sm text-gray-500">
                            This will be labelled <span className="font-semibold text-[#0A1B3C]">ASM{instanceNumber}</span>
                        </span>
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-semibold text-[#0A1B3C] mb-1.5">
                        Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Describe what students need to do for this assignment..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-[#F37022] focus:ring-2 focus:ring-orange-100 outline-none resize-none"
                        disabled={isSubmitting}
                    />
                    <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/4000</p>
                </div>

                {/* Due Date */}
                <div>
                    <label className="block text-sm font-semibold text-[#0A1B3C] mb-1.5">
                        <Calendar className="w-4 h-4 inline mr-1 text-gray-500" />
                        Due Date <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <DatePicker
                        showTime
                        format="YYYY-MM-DD HH:mm"
                        className="w-full h-[42px] border-gray-300 rounded-lg hover:border-[#F37022] focus:border-[#F37022]"
                        value={dueDate ? dayjs(dueDate) : null}
                        onChange={(date) => setDueDate(date ? date.format('YYYY-MM-DDTHH:mm:ss') : '')}
                        placeholder="Select due date & time"
                        disabled={isSubmitting}
                        disabledDate={(current) => current && current < dayjs().startOf('day')}
                    />
                </div>

                {/* File Attachment */}
                <div>
                    <label className="block text-sm font-semibold text-[#0A1B3C] mb-1.5">
                        Attachment <span className="text-gray-400 font-normal">(optional)</span>
                        <span className="text-gray-400 font-normal ml-1">(Assignment brief / requirements file)</span>
                    </label>

                    {selectedFile ? (
                        <div className="flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="w-10 h-10 bg-white rounded-lg border border-orange-200 flex items-center justify-center flex-shrink-0">
                                {getUploadIcon()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-[#0A1B3C] truncate">{selectedFile.name}</p>
                                <p className="text-xs text-gray-500">{formatFileSize(selectedFile.size)}</p>
                                {uploadProgress === 'uploading' && (
                                    <p className="text-xs text-[#F37022] mt-0.5">Uploading...</p>
                                )}
                                {uploadProgress === 'done' && (
                                    <p className="text-xs text-green-600 mt-0.5">Upload complete</p>
                                )}
                                {uploadProgress === 'error' && (
                                    <p className="text-xs text-red-600 mt-0.5">Upload failed. Please try again.</p>
                                )}
                            </div>
                            {!isSubmitting && (
                                <button
                                    onClick={() => {
                                        setSelectedFile(null);
                                        setUploadProgress('idle');
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="p-1 hover:bg-red-100 rounded transition-colors flex-shrink-0"
                                >
                                    <X className="w-4 h-4 text-red-500" />
                                </button>
                            )}
                        </div>
                    ) : (
                        <div
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
                                isDragging
                                    ? 'border-[#F37022] bg-orange-50'
                                    : 'border-gray-300 hover:border-[#F37022] hover:bg-gray-50'
                            }`}
                        >
                            <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-[#F37022]' : 'text-gray-400'}`} />
                            <p className="text-sm font-medium text-gray-700">
                                {isDragging ? 'Drop file here' : 'Click to browse or drag & drop'}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">PDF, DOCX, ZIP, etc. — max 50MB</p>
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.doc,.docx,.zip,.rar,.txt,.pptx,.xlsx,.xls"
                        onChange={handleFileInputChange}
                        disabled={isSubmitting}
                    />
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                    <button
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !description.trim()}
                        className="flex items-center gap-2 px-5 py-2 bg-[#F37022] text-white rounded-lg text-sm font-semibold hover:bg-[#D96419] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isUploading ? 'Uploading...' : 'Creating...'}
                            </>
                        ) : (
                            <>
                                <ClipboardList className="w-4 h-4" />
                                {selectedClassSubjectIds.length > 1
                                    ? `Create for ${selectedClassSubjectIds.length} Classes`
                                    : 'Create Assignment'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
