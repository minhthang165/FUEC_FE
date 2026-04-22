import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';

export interface QuestionData {
    id?: string;
    content: string;
    type: 'multiple_choice' | 'true_false' | 'essay';
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
    options?: string[];
    correctAnswers?: number[]; // an array of indices of correct options
    chapter: number;
    rawOptions?: any[];
}

interface QuestionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (question: QuestionData) => void;
    editData?: QuestionData | null;
}

const emptyQuestion: QuestionData = {
    content: '',
    type: 'multiple_choice',
    difficulty: 'medium',
    tags: [],
    options: ['', ''],
    correctAnswers: [0],
    chapter: 1,
};

export default function QuestionModal({ isOpen, onClose, onSave, editData }: QuestionModalProps) {
    const [form, setForm] = useState<QuestionData>(emptyQuestion);
    const [tagInput, setTagInput] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const isEdit = !!editData?.id;

    useEffect(() => {
        if (editData) {
            setForm({
                ...editData,
                options: editData.options || ['', ''],
                correctAnswers: editData.correctAnswers ?? [0],
            });
        } else {
            setForm({ ...emptyQuestion, options: ['', ''] });
        }
        setErrors({});
        setTagInput('');
    }, [editData, isOpen]);

    const validate = (): boolean => {
        const errs: Record<string, string> = {};
        if (!form.content.trim()) errs.content = 'Question content is required';

        if (form.chapter < 1) {
            errs.chapter = 'Chapter must be at least 1';
        }

        const validOpts = (form.options || []).filter(o => o.trim());
        if (validOpts.length < 2) errs.options = 'At least 2 options required';

        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSave = () => {
        if (!validate()) return;
        onSave({
            ...form,
            options: form.options,
            correctAnswers: form.correctAnswers,
        });
    };

    const addOption = () => {
        setForm(f => ({ ...f, options: [...(f.options || []), ''] }));
    };

    const removeOption = (idx: number) => {
        setForm(f => {
            const opts = [...(f.options || [])];
            opts.splice(idx, 1);
            let correct = f.correctAnswers ? [...f.correctAnswers] : [];
            // remove this index from correctAnswers
            correct = correct.filter(c => c !== idx);
            // shift indices that are greater than idx
            correct = correct.map(c => c > idx ? c - 1 : c);
            if (correct.length === 0 && opts.length > 0) correct = [0];
            return { ...f, options: opts, correctAnswers: correct };
        });
    };

    const updateOption = (idx: number, value: string) => {
        setForm(f => {
            const opts = [...(f.options || [])];
            opts[idx] = value;
            return { ...f, options: opts };
        });
    };

    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !form.tags.includes(tag)) {
            setForm(f => ({ ...f, tags: [...f.tags, tag] }));
        }
        setTagInput('');
    };

    const removeTag = (tag: string) => {
        setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }));
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl flex items-center justify-between z-10">
                    <h2 className="text-xl font-bold text-[#0A1B3C]">
                        {isEdit ? 'Edit Question' : 'Add New Question'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    {/* Question Content */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Question Content *</label>
                        <textarea
                            value={form.content}
                            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                            rows={3}
                            className={`w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F37022] focus:border-transparent resize-none ${errors.content ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="Enter question content..."
                        />
                        {errors.content && <p className="text-red-500 text-xs mt-1">{errors.content}</p>}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Chapter *</label>
                        <input
                            type="number"
                            min="1"
                            value={form.chapter}
                            onChange={e => setForm(f => ({ ...f, chapter: parseInt(e.target.value) || 0 }))}
                            className={`w-full sm:w-32 px-4 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F37022] focus:border-transparent ${errors.chapter ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                            placeholder="Ch."
                        />
                        {errors.chapter && <p className="text-red-500 text-xs mt-1">{errors.chapter}</p>}
                    </div>



                    {/* Answer Options */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Answer Options *</label>
                        <div className="space-y-2">
                            {(form.options || []).map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setForm(f => {
                                            const current = f.correctAnswers || [];
                                            let newCorrect = [];
                                            if (current.includes(idx)) {
                                                newCorrect = current.filter(c => c !== idx);
                                            } else {
                                                newCorrect = [...current, idx];
                                            }
                                            if (newCorrect.length === 0) newCorrect = current; // prevent unselecting all
                                            return { ...f, correctAnswers: newCorrect };
                                        })}
                                        className={`w-8 h-8 ${form.correctAnswers?.includes(idx) ? 'rounded-md' : 'rounded-full'} flex items-center justify-center flex-shrink-0 text-sm font-bold border-2 transition-all ${form.correctAnswers?.includes(idx)
                                            ? 'bg-green-500 border-green-500 text-white'
                                            : 'border-gray-300 text-gray-400 hover:border-green-400'
                                            }`}
                                        title={form.correctAnswers?.includes(idx) ? 'Correct answer' : 'Mark as correct'}
                                    >
                                        {String.fromCharCode(65 + idx)}
                                    </button>
                                    <input
                                        value={opt}
                                        onChange={e => updateOption(idx, e.target.value)}
                                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37022]"
                                    />
                                    {(form.options || []).length > 2 && (
                                        <button
                                            onClick={() => removeOption(idx)}
                                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {errors.options && <p className="text-red-500 text-xs mt-1">{errors.options}</p>}
                        {(form.options || []).length < 6 && (
                            <button
                                onClick={addOption}
                                className="mt-2 flex items-center gap-1 text-sm text-[#F37022] hover:text-[#D96419] font-medium"
                            >
                                <Plus className="w-4 h-4" /> Add Option
                            </button>
                        )}
                        <p className="text-xs text-gray-400 mt-1">Click the letter to mark the correct answer (green = correct)</p>
                    </div>


                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Tags</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {form.tags.map(tag => (
                                <span key={tag} className="flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 text-xs font-medium rounded-lg border border-orange-200">
                                    {tag}
                                    <button onClick={() => removeTag(tag)} className="hover:text-red-600">
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                                placeholder="Type a tag and press Enter"
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F37022]"
                            />
                            <button
                                onClick={addTag}
                                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200 transition-colors"
                            >
                                Add
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 rounded-b-2xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 py-2.5 bg-[#F37022] text-white rounded-xl text-sm font-semibold hover:bg-[#D96419] transition-colors shadow-sm"
                    >
                        {isEdit ? 'Save Changes' : 'Add Question'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
