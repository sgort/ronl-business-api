// packages/public-site/src/App.tsx
import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { translations, type Lang } from './i18n';
import SkipLink from './components/SkipLink';
import TopBar from './components/TopBar';
import MainNav from './components/MainNav';
import Footer from './components/Footer';
import Home from './pages/Home';
import NotFound from './pages/NotFound';
import Results from './pages/Results';
import SectionIndex from './pages/SectionIndex';
import Regelcatalogus from './pages/Regelcatalogus';
import Woordenboek from './pages/Woordenboek';
import Detail from './pages/Detail';
import Toegankelijkheid from './pages/Toegankelijkheid';
import OpenData from './pages/OpenData';

export default function App() {
  const [lang, setLang] = useState<Lang>('nl');
  const t = translations[lang];

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <div className="pub">
      <SkipLink label={t.skip} />
      <TopBar t={t} lang={lang} onLangChange={setLang} />
      <MainNav lang={lang} />
      <Routes>
        <Route path="/" element={<Home t={t} lang={lang} />} />
        <Route path="/zoeken" element={<Results t={t} lang={lang} />} />
        <Route path="/berichten" element={<SectionIndex t={t} lang={lang} type="bericht" />} />
        <Route path="/berichten/:slug" element={<Detail t={t} lang={lang} type="bericht" />} />
        <Route path="/nieuws" element={<SectionIndex t={t} lang={lang} type="nieuws" />} />
        <Route path="/nieuws/:slug" element={<Detail t={t} lang={lang} type="nieuws" />} />
        <Route path="/producten" element={<SectionIndex t={t} lang={lang} type="product" />} />
        <Route path="/producten/:slug" element={<Detail t={t} lang={lang} type="product" />} />
        <Route path="/regels" element={<Regelcatalogus t={t} lang={lang} />} />
        <Route path="/regels/:slug" element={<Detail t={t} lang={lang} type="regel" />} />
        <Route path="/processen" element={<SectionIndex t={t} lang={lang} type="proces" />} />
        <Route path="/processen/:slug" element={<Detail t={t} lang={lang} type="proces" />} />
        <Route path="/woordenboek" element={<Woordenboek lang={lang} />} />
        <Route path="/toegankelijkheid" element={<Toegankelijkheid lang={lang} />} />
        <Route path="/open-data" element={<OpenData lang={lang} />} />
        <Route path="*" element={<NotFound lang={lang} />} />
      </Routes>
      <Footer t={t} lang={lang} />
    </div>
  );
}
