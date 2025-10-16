import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Header } from './Header'

const renderHeader = (isAuthenticated: boolean) =>
  render(
    <MemoryRouter>
      <Header auth={{ isAuthenticated, token: isAuthenticated ? 't' : null, username: isAuthenticated ? 'Alice' : null }} onLogout={() => {}} />
    </MemoryRouter>
  )

it('renders links for guest', () => {
  renderHeader(false)
  expect(screen.getByText('Courses')).toBeInTheDocument()
  expect(screen.getByText('Вход')).toBeInTheDocument()
  expect(screen.getByText('Регистрация')).toBeInTheDocument()
})

it('renders username and logout for authenticated user', () => {
  renderHeader(true)
  expect(screen.getByText('Courses')).toBeInTheDocument()
  expect(screen.getByText(/Привет, Alice/)).toBeInTheDocument()
  expect(screen.getByText('Выйти')).toBeInTheDocument()
})
