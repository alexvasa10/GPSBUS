import React, { useState, useEffect } from 'react';
import { VehicleSpecs } from '../types';

interface Props {
  onSave: (specs: VehicleSpecs) => void;
}

const VehicleSetup: React.FC<Props> = ({ onSave }) => {
  const [profiles, setProfiles] = useState<VehicleSpecs[]>([]);
  const [view, setView] = useState<'list' | 'form'>('list');
  
  // Form State
  const [formData, setFormData] = useState<VehicleSpecs>({
    id: '',
    name: '',
    height: 3.8,
    width: 2.55,
    length: 12,
    weight: 18,
    cargoType: 'general'
  });

  useEffect(() => {
    const saved = localStorage.getItem('bus_profiles');
    if (saved) {
      const parsed = JSON.parse(saved);
      setProfiles(parsed);
      if (parsed.length === 0) setView('form');
    } else {
      setView('form');
    }
  }, []);

  const handleEdit = (profile: VehicleSpecs) => {
    setFormData(profile);
    setView('form');
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = profiles.filter(p => p.id !== id);
    setProfiles(updated);
    localStorage.setItem('bus_profiles', JSON.stringify(updated));
    if (updated.length === 0) setView('form');
  };

  const handleSelect = (profile: VehicleSpecs) => {
    onSave(profile);
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'name' || name === 'cargoType' ? value : parseFloat(value)
    }));
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newProfile = { ...formData, id: formData.id || Date.now().toString() };
    
    let updatedProfiles;
    if (formData.id) {
      updatedProfiles = profiles.map(p => p.id === formData.id ? newProfile : p);
    } else {
      updatedProfiles = [...profiles, newProfile];
    }

    setProfiles(updatedProfiles);
    localStorage.setItem('bus_profiles', JSON.stringify(updatedProfiles));
    onSave(newProfile);
  };

  if (view === 'list' && profiles.length > 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
        <div className="w-full max-w-2xl">
          <h2 className="text-2xl font-black text-center text-gray-800 mb-6 waze-font">Elige tu vehículo</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map(profile => (
              <div 
                key={profile.id}
                onClick={() => handleSelect(profile)}
                className="bg-white border border-gray-100 p-6 rounded-3xl shadow-sm hover:shadow-xl cursor-pointer transition-all hover:-translate-y-1 relative group"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-gray-800">{profile.name}</h3>
                  <button 
                    onClick={(e) => handleDelete(profile.id, e)}
                    className="text-gray-300 hover:text-red-400 p-1"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="text-sm text-gray-500 space-y-1 mb-4">
                  <p>📏 {profile.height}m x {profile.width}m x {profile.length}m</p>
                  <p>⚖️ {profile.weight}t</p>
                  <p className="capitalize text-blue-500 font-bold">📦 {profile.cargoType}</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleEdit(profile); }}
                  className="w-full text-xs bg-gray-50 hover:bg-blue-50 text-gray-600 hover:text-blue-500 py-2 rounded-xl font-bold transition-colors"
                >
                  Editar
                </button>
              </div>
            ))}
            
            <div 
              onClick={() => {
                setFormData({ id: '', name: '', height: 3.8, width: 2.55, length: 12, weight: 18, cargoType: 'general' });
                setView('form');
              }}
              className="bg-gray-50 border-2 border-dashed border-gray-300 hover:border-blue-400 p-6 rounded-3xl cursor-pointer transition-colors flex flex-col items-center justify-center text-gray-400 hover:text-blue-500 min-h-[180px]"
            >
              <div className="bg-white p-3 rounded-full shadow-sm mb-3">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                 </svg>
              </div>
              <span className="font-bold">Añadir Vehículo</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 animate-fade-in">
      <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-gray-800 waze-font">{formData.id ? 'Editar' : 'Nuevo'} Autocar</h2>
          {profiles.length > 0 && (
            <button onClick={() => setView('list')} className="text-sm text-gray-400 hover:text-gray-600 font-bold">
              Cancelar
            </button>
          )}
        </div>

        <form onSubmit={handleFormSubmit} className="space-y-5">
          <div>
            <label className="block text-gray-400 text-xs uppercase font-extrabold mb-2 tracking-wider">Nombre</label>
            <input
              type="text"
              name="name"
              placeholder="Ej. Mi Scania"
              value={formData.name}
              onChange={handleFormChange}
              required
              className="w-full bg-gray-50 border-none rounded-2xl py-3 px-4 text-gray-800 font-bold focus:ring-2 focus:ring-blue-400 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-xs uppercase font-extrabold mb-2 tracking-wider">Altura (m)</label>
              <input
                type="number"
                step="0.1"
                name="height"
                value={formData.height}
                onChange={handleFormChange}
                className="w-full bg-gray-50 border-none rounded-2xl py-3 px-4 text-gray-800 font-bold focus:ring-2 focus:ring-blue-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs uppercase font-extrabold mb-2 tracking-wider">Ancho (m)</label>
              <input
                type="number"
                step="0.1"
                name="width"
                value={formData.width}
                onChange={handleFormChange}
                className="w-full bg-gray-50 border-none rounded-2xl py-3 px-4 text-gray-800 font-bold focus:ring-2 focus:ring-blue-400 transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-gray-400 text-xs uppercase font-extrabold mb-2 tracking-wider">Largo (m)</label>
              <input
                type="number"
                step="0.5"
                name="length"
                value={formData.length}
                onChange={handleFormChange}
                className="w-full bg-gray-50 border-none rounded-2xl py-3 px-4 text-gray-800 font-bold focus:ring-2 focus:ring-blue-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-gray-400 text-xs uppercase font-extrabold mb-2 tracking-wider">Peso (t)</label>
              <input
                type="number"
                step="0.5"
                name="weight"
                value={formData.weight}
                onChange={handleFormChange}
                className="w-full bg-gray-50 border-none rounded-2xl py-3 px-4 text-gray-800 font-bold focus:ring-2 focus:ring-blue-400 transition-all"
              />
            </div>
          </div>

          <div>
             <label className="block text-gray-400 text-xs uppercase font-extrabold mb-2 tracking-wider">Tipo de Carga</label>
             <div className="relative">
                <select
                  name="cargoType"
                  value={formData.cargoType}
                  onChange={handleFormChange}
                  className="w-full bg-gray-50 border-none rounded-2xl py-3 px-4 text-gray-800 font-bold focus:ring-2 focus:ring-blue-400 transition-all appearance-none"
                >
                  <option value="general">Pasajeros / Carga General</option>
                  <option value="peligrosa">Mercancías Peligrosas (ADR)</option>
                  <option value="animales">Animales Vivos</option>
                  <option value="fragil">Carga Frágil</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
             </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-black text-lg py-4 rounded-2xl shadow-lg shadow-blue-500/40 transition-all transform hover:scale-[1.02] mt-4"
          >
            Guardar
          </button>
        </form>
      </div>
    </div>
  );
};

export default VehicleSetup;